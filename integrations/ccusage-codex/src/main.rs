use std::{
    env, fs,
    io::{self, BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use ccusage_adapter_codex::{
    CodexServiceTier, CodexTokenUsageEvent, aggregate_events, calculate_codex_model_cost,
    codex_model_missing_pricing, load_codex_events_with_detection,
};
use ccusage_adapter_common::collect_usage_files;
use ccusage_core::{
    PricingMap,
    cli::{AgentReportKind, SharedArgs},
    date_utils::parse_ts_timestamp,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

const CACHE_SCHEMA_VERSION: u32 = 4;
const RESPONSE_SCHEMA_VERSION: u32 = 4;
const ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct Event {
    session_id: String,
    timestamp: String,
    model: Option<String>,
    input_tokens: u64,
    cached_input_tokens: u64,
    cache_creation_tokens: u64,
    output_tokens: u64,
    reasoning_output_tokens: u64,
    total_tokens: u64,
    service_tier: Option<String>,
    is_fallback_model: bool,
    project_path: Option<String>,
    parent_session_id: Option<String>,
    cost_usd: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Response {
    schema_version: u32,
    engine: &'static str,
    scanned_at: String,
    files_scanned: usize,
    cache_hit: bool,
    latest_rate_limits: Option<LatestRateLimits>,
    summary: UsageSummary,
    events: Vec<Event>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LatestRateLimits {
    timestamp_unix: i64,
    primary: Option<Value>,
    secondary: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UsageSummary {
    today: PeriodSummary,
    current: PeriodSummary,
    previous: PeriodSummary,
    month: PeriodSummary,
    total: PeriodSummary,
    subtotal: PeriodSummary,
    daily: Vec<DailySummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PeriodSummary {
    messages: usize,
    tokens: u64,
    models: Vec<ModelSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelSummary {
    model: String,
    input_tokens: u64,
    cached_input_tokens: u64,
    cache_creation_tokens: u64,
    output_tokens: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DailyWindow {
    day: String,
    from: String,
    to: String,
}

#[derive(Debug, Clone, Serialize)]
struct DailySummary {
    day: String,
    tokens: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct Fingerprint {
    path: String,
    session_key: String,
    project_path: Option<String>,
    parent_session_id: Option<String>,
    size: u64,
    modified_nanos: u128,
}

#[derive(Serialize, Deserialize)]
struct Cache {
    schema_version: u32,
    engine_version: String,
    fingerprints: Vec<Fingerprint>,
    events: Vec<Event>,
    latest_rate_limits: Option<LatestRateLimits>,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("codex-ui ccusage bridge: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let homes = codex_homes();
    if homes.is_empty() {
        return Err("CODEX_HOME or HOME must be set".into());
    }
    let cache_path = env::var_os("CODEX_UI_EVENT_CACHE").map(PathBuf::from);
    let fingerprints = fingerprints(&homes);
    let cached = cache_path
        .as_deref()
        .and_then(|path| load_cache(path).ok())
        .filter(|cache| {
            cache.schema_version == CACHE_SCHEMA_VERSION
                && cache.engine_version == ENGINE_VERSION
                && cache.fingerprints == fingerprints
        });

    let (events, latest_rate_limits, cache_hit) = if let Some(cache) = cached {
        (cache.events, cache.latest_rate_limits, true)
    } else {
        let (raw_events, _detected) = load_codex_events_with_detection(&SharedArgs {
            // The desktop app favors a bounded resident set over saturating
            // every CPU core with concurrent session-file buffers.
            single_thread: true,
            offline: true,
            ..SharedArgs::with_defaults()
        })
        .map_err(|error| io::Error::other(error.to_string()))?;
        let metadata_by_session = fingerprints
            .iter()
            .map(|file| (file.session_key.as_str(), file))
            .collect::<std::collections::HashMap<_, _>>();
        let pricing = PricingMap::load_embedded();
        let events = raw_events
            .iter()
            .map(|event| normalize_event(event, &metadata_by_session, &pricing))
            .collect::<Vec<_>>();
        let latest_rate_limits = scan_latest_rate_limits(&fingerprints);
        if let Some(path) = cache_path.as_deref() {
            write_cache(path, &fingerprints, &events, latest_rate_limits.as_ref())?;
        }
        (events, latest_rate_limits, false)
    };

    let now = env::var("CODEX_UI_SUMMARY_NOW").unwrap_or_default();
    let today_start = env::var("CODEX_UI_SUMMARY_TODAY_START").unwrap_or_default();
    let month_start = env::var("CODEX_UI_SUMMARY_MONTH_START").unwrap_or_default();
    let subtotal_start = env::var("CODEX_UI_SUMMARY_SUBTOTAL_START").unwrap_or_default();
    let range_from = env::var("CODEX_UI_EVENTS_FROM").unwrap_or_default();
    let range_to = env::var("CODEX_UI_EVENTS_TO").unwrap_or_default();
    let daily_windows = env::var("CODEX_UI_DAILY_WINDOWS")
        .ok()
        .and_then(|raw| serde_json::from_str::<Vec<DailyWindow>>(&raw).ok())
        .unwrap_or_default();
    let now_unix = parse_ts_timestamp(&now)
        .map(|timestamp| timestamp.as_millis() / 1000)
        .unwrap_or_else(|| {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_or(0, |duration| duration.as_secs() as i64)
        });
    let (current_from_unix, previous_from_unix, current_to_unix) =
        summary_period_bounds(latest_rate_limits.as_ref(), now_unix);
    let today_start_unix = timestamp_unix(&today_start);
    let month_start_unix = timestamp_unix(&month_start);
    let subtotal_start_unix = timestamp_unix(&subtotal_start);
    let summary = UsageSummary {
        today: summarize(&events, today_start_unix, Some(now_unix + 1)),
        current: summarize(&events, Some(current_from_unix), Some(current_to_unix)),
        previous: summarize(&events, Some(previous_from_unix), Some(current_from_unix)),
        month: summarize(&events, month_start_unix, Some(now_unix + 1)),
        total: summarize(&events, None, Some(now_unix + 1)),
        subtotal: summarize(&events, subtotal_start_unix, Some(now_unix + 1)),
        daily: daily_windows
            .into_iter()
            .map(|window| DailySummary {
                tokens: events
                    .iter()
                    .filter(|event| {
                        event.timestamp.as_str() >= window.from.as_str()
                            && event.timestamp.as_str() < window.to.as_str()
                    })
                    .map(|event| event.total_tokens)
                    .sum(),
                day: window.day,
            })
            .collect(),
    };
    let recent_events = events
        .into_iter()
        .filter(|event| {
            (range_from.is_empty() || event.timestamp.as_str() >= range_from.as_str())
                && (range_to.is_empty() || event.timestamp.as_str() <= range_to.as_str())
        })
        .collect();
    let response = Response {
        schema_version: RESPONSE_SCHEMA_VERSION,
        engine: "ccusage-rust-codex-adapter",
        scanned_at: ccusage_core::date_utils::format_rfc3339_millis(
            ccusage_core::date_utils::utc_now(),
        ),
        files_scanned: fingerprints.len(),
        cache_hit,
        latest_rate_limits,
        summary,
        events: recent_events,
    };
    serde_json::to_writer(io::stdout().lock(), &response)?;
    io::stdout().lock().flush()?;
    Ok(())
}

fn summarize(events: &[Event], from: Option<i64>, to: Option<i64>) -> PeriodSummary {
    let mut messages = 0;
    let mut tokens = 0;
    let mut models = std::collections::HashMap::<String, ModelSummary>::new();
    for event in events.iter().filter(|event| {
        let timestamp = parse_ts_timestamp(&event.timestamp).map(|value| value.as_millis());
        timestamp.is_some_and(|timestamp| {
            from.is_none_or(|bound| timestamp >= bound * 1000)
                && to.is_none_or(|bound| timestamp < bound * 1000)
        })
    }) {
        messages += 1;
        tokens += event.total_tokens;
        let model = event.model.as_deref().unwrap_or("unknown").to_string();
        let row = models.entry(model.clone()).or_insert_with(|| ModelSummary {
            model,
            input_tokens: 0,
            cached_input_tokens: 0,
            cache_creation_tokens: 0,
            output_tokens: 0,
        });
        row.input_tokens += event.input_tokens;
        row.cached_input_tokens += event.cached_input_tokens;
        row.cache_creation_tokens += event.cache_creation_tokens;
        row.output_tokens += event.output_tokens;
    }
    let mut models = models.into_values().collect::<Vec<_>>();
    models.sort_by(|left, right| left.model.cmp(&right.model));
    PeriodSummary {
        messages,
        tokens,
        models,
    }
}

fn timestamp_unix(value: &str) -> Option<i64> {
    parse_ts_timestamp(value).map(|timestamp| timestamp.as_millis() / 1000)
}

fn summary_period_bounds(latest: Option<&LatestRateLimits>, now_unix: i64) -> (i64, i64, i64) {
    const WEEK_SECONDS: i64 = 7 * 24 * 60 * 60;
    let weekly = latest.and_then(|latest| {
        [&latest.primary, &latest.secondary]
            .into_iter()
            .flatten()
            .find(|window| window_duration_minutes(window) == Some(10_080))
    });
    let current_from = weekly
        .and_then(window_reset_seconds)
        .map(|reset| reset - WEEK_SECONDS)
        .unwrap_or(now_unix - WEEK_SECONDS);
    (current_from, current_from - WEEK_SECONDS, now_unix + 1)
}

fn window_duration_minutes(window: &Value) -> Option<i64> {
    [
        "window_minutes",
        "windowDurationMins",
        "window_duration_mins",
    ]
    .iter()
    .find_map(|key| window.get(key)?.as_i64())
}

fn window_reset_seconds(window: &Value) -> Option<i64> {
    let value = ["resets_at", "resetsAt", "reset_at_unix", "resetAtUnix"]
        .iter()
        .find_map(|key| window.get(key)?.as_i64())?;
    Some(if value > 10_000_000_000 {
        value / 1000
    } else {
        value
    })
}

fn scan_latest_rate_limits(fingerprints: &[Fingerprint]) -> Option<LatestRateLimits> {
    let mut latest: Option<LatestRateLimits> = None;
    for fingerprint in fingerprints {
        let Ok(file) = fs::File::open(&fingerprint.path) else {
            continue;
        };
        let mut reader = BufReader::with_capacity(128 * 1024, file);
        let mut line = Vec::new();
        loop {
            line.clear();
            let Ok(bytes_read) = reader.read_until(b'\n', &mut line) else {
                break;
            };
            if bytes_read == 0 {
                break;
            }
            let Ok(entry) = serde_json::from_slice::<Value>(&line) else {
                continue;
            };
            let Some(payload) = entry.get("payload") else {
                continue;
            };
            if payload.get("type").and_then(Value::as_str) != Some("token_count") {
                continue;
            }
            let Some(rate_limits) = payload.get("rate_limits") else {
                continue;
            };
            let Some(timestamp) = entry
                .get("timestamp")
                .or_else(|| payload.get("timestamp"))
                .and_then(Value::as_str)
                .and_then(parse_ts_timestamp)
            else {
                continue;
            };
            let timestamp_unix = timestamp.as_millis() / 1000;
            if latest
                .as_ref()
                .is_some_and(|current| current.timestamp_unix >= timestamp_unix)
            {
                continue;
            }
            latest = Some(LatestRateLimits {
                timestamp_unix,
                primary: rate_limits.get("primary").cloned(),
                secondary: rate_limits.get("secondary").cloned(),
            });
        }
    }
    latest
}

fn normalize_event(
    event: &CodexTokenUsageEvent,
    metadata_by_session: &std::collections::HashMap<&str, &Fingerprint>,
    pricing: &PricingMap,
) -> Event {
    let metadata = metadata_by_session.get(event.session_id.as_str());
    let cost_usd = event.model.as_deref().and_then(|model| {
        let groups = aggregate_events(
            std::slice::from_ref(event),
            AgentReportKind::Session,
            Some("UTC"),
        )
        .ok()?;
        let usage = groups.get(&event.session_id)?.models.get(model)?;
        if codex_model_missing_pricing(model, usage, pricing) {
            return None;
        }
        Some(calculate_codex_model_cost(
            model,
            usage,
            pricing,
            ccusage_adapter_codex::CodexSpeedPolicy::Auto(CodexServiceTier::Standard),
        ))
    });
    Event {
        session_id: event.session_id.clone(),
        timestamp: event.timestamp.clone(),
        model: event.model.clone(),
        input_tokens: event.input_tokens,
        cached_input_tokens: event.cached_input_tokens,
        cache_creation_tokens: event.cache_creation_tokens,
        output_tokens: event.output_tokens,
        reasoning_output_tokens: event.reasoning_output_tokens,
        total_tokens: event.total_tokens,
        service_tier: event.service_tier.map(|tier| match tier {
            CodexServiceTier::Standard => "standard".to_string(),
            CodexServiceTier::Fast => "fast".to_string(),
        }),
        is_fallback_model: event.is_fallback_model,
        project_path: metadata.and_then(|file| file.project_path.clone()),
        parent_session_id: metadata.and_then(|file| file.parent_session_id.clone()),
        cost_usd,
    }
}

fn codex_homes() -> Vec<PathBuf> {
    if let Some(raw) = env::var_os("CODEX_HOME") {
        return raw
            .to_string_lossy()
            .split(',')
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .map(PathBuf::from)
            .collect();
    }
    env::var_os("HOME")
        .map(|home| vec![PathBuf::from(home).join(".codex")])
        .unwrap_or_default()
}

fn fingerprints(homes: &[PathBuf]) -> Vec<Fingerprint> {
    let mut fingerprints = Vec::new();
    for home in homes {
        for directory in [home.join("sessions"), home.join("archived_sessions")] {
            let mut files = Vec::new();
            collect_usage_files(&directory, &mut files);
            for path in files {
                let Ok(metadata) = fs::metadata(&path) else {
                    continue;
                };
                let modified_nanos = metadata
                    .modified()
                    .ok()
                    .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                    .map_or(0, |time| time.as_nanos());
                let (project_path, parent_session_id) = read_session_metadata(&path);
                fingerprints.push(Fingerprint {
                    path: path.to_string_lossy().into_owned(),
                    session_key: session_key(&directory, &path),
                    project_path,
                    parent_session_id,
                    size: metadata.len(),
                    modified_nanos,
                });
            }
        }
    }
    fingerprints.sort_by(|left, right| left.path.cmp(&right.path));
    fingerprints
}

fn session_key(directory: &Path, path: &Path) -> String {
    path.strip_prefix(directory)
        .unwrap_or(path)
        .with_extension("")
        .components()
        .filter_map(|component| component.as_os_str().to_str())
        .collect::<Vec<_>>()
        .join("/")
}

fn read_session_metadata(path: &Path) -> (Option<String>, Option<String>) {
    let Ok(file) = fs::File::open(path) else {
        return (None, None);
    };
    let mut line = Vec::new();
    if BufReader::new(file)
        .take(1_048_577)
        .read_until(b'\n', &mut line)
        .is_err()
        || line.len() > 1_048_576
    {
        return (None, None);
    }
    parse_session_metadata(&line)
}

fn parse_session_metadata(line: &[u8]) -> (Option<String>, Option<String>) {
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(line) else {
        return (None, None);
    };
    if value.get("type").and_then(serde_json::Value::as_str) != Some("session_meta") {
        return (None, None);
    }
    let Some(payload) = value.get("payload").filter(|value| value.is_object()) else {
        return (None, None);
    };
    let project = payload
        .get("cwd")
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string);
    let parent = payload
        .get("forked_from_id")
        .and_then(serde_json::Value::as_str)
        .or_else(|| {
            payload
                .get("parent_thread_id")
                .and_then(serde_json::Value::as_str)
        })
        .or_else(|| {
            payload
                .get("source")?
                .get("subagent")?
                .get("thread_spawn")?
                .get("parent_thread_id")?
                .as_str()
        })
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string);
    (project, parent)
}

fn load_cache(path: &Path) -> Result<Cache, Box<dyn std::error::Error>> {
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

fn write_cache(
    path: &Path,
    fingerprints: &[Fingerprint],
    events: &[Event],
    latest_rate_limits: Option<&LatestRateLimits>,
) -> io::Result<()> {
    let Some(parent) = path.parent() else {
        return Err(io::Error::other("cache path has no parent"));
    };
    fs::create_dir_all(parent)?;
    let temporary = path.with_extension(format!("tmp-{}", std::process::id()));
    let cache = Cache {
        schema_version: CACHE_SCHEMA_VERSION,
        engine_version: ENGINE_VERSION.to_string(),
        fingerprints: fingerprints.to_vec(),
        events: events.to_vec(),
        latest_rate_limits: latest_rate_limits.cloned(),
    };
    let serialized = serde_json::to_vec(&cache).map_err(io::Error::other)?;
    fs::write(&temporary, serialized)?;
    fs::rename(temporary, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_all_usage_fields_and_preserves_timestamp_and_session() {
        let event = CodexTokenUsageEvent {
            session_id: "2026/09/23/rollout-test".to_string(),
            timestamp: "2026-09-23T09:10:11.123Z".to_string(),
            model: Some("gpt-5".to_string()),
            input_tokens: 100,
            cached_input_tokens: 25,
            cache_creation_tokens: 0,
            output_tokens: 40,
            reasoning_output_tokens: 15,
            total_tokens: 140,
            is_fallback_model: false,
            service_tier: Some(CodexServiceTier::Fast),
        };

        let normalized = normalize_event(
            &event,
            &std::collections::HashMap::new(),
            &PricingMap::load_embedded(),
        );
        assert_eq!(normalized.timestamp, event.timestamp);
        assert_eq!(normalized.session_id, event.session_id);
        assert_eq!(normalized.service_tier.as_deref(), Some("fast"));
        assert_eq!(normalized.total_tokens, 140);
    }

    #[test]
    fn embedded_gpt_6_rates_include_cache_writes() {
        let pricing = PricingMap::load_embedded();
        for (model, input, cached, cache_creation, output, expected_cost) in [
            ("gpt-6-luna", 100_000, 40_000, 10_000, 20_000, 0.01665),
            ("gpt-6-sol", 100_000, 20_000, 30_000, 10_000, 0.279),
            ("gpt-6-astra", 100_000, 20_000, 10_000, 10_000, 1.345),
        ] {
            let event = CodexTokenUsageEvent {
                session_id: "2026/09/23/rollout-pricing".to_string(),
                timestamp: "2026-09-23T09:10:11.123Z".to_string(),
                model: Some(model.to_string()),
                input_tokens: input,
                cached_input_tokens: cached,
                cache_creation_tokens: cache_creation,
                output_tokens: output,
                reasoning_output_tokens: 0,
                total_tokens: input + output,
                is_fallback_model: false,
                service_tier: Some(CodexServiceTier::Standard),
            };
            let normalized = normalize_event(&event, &std::collections::HashMap::new(), &pricing);
            let actual = normalized.cost_usd.expect("GPT-6 model should be priced");
            assert!(
                (actual - expected_cost).abs() < 1e-9,
                "{model} cost was {actual}, expected {expected_cost}"
            );
        }
    }

    #[test]
    fn response_is_a_versioned_raw_event_contract() {
        let response = Response {
            schema_version: RESPONSE_SCHEMA_VERSION,
            engine: "ccusage-rust-codex-adapter",
            scanned_at: "2026-09-23T09:10:11.123Z".to_string(),
            files_scanned: 1,
            cache_hit: false,
            latest_rate_limits: None,
            summary: UsageSummary {
                today: empty_summary(),
                current: empty_summary(),
                previous: empty_summary(),
                month: empty_summary(),
                total: empty_summary(),
                subtotal: empty_summary(),
                daily: Vec::new(),
            },
            events: Vec::new(),
        };
        let json = serde_json::to_value(response).unwrap();
        assert_eq!(json["schemaVersion"], RESPONSE_SCHEMA_VERSION);
        assert_eq!(json["engine"], "ccusage-rust-codex-adapter");
        assert!(json["events"].as_array().unwrap().is_empty());
    }

    #[test]
    fn session_metadata_keeps_project_and_agent_parent_attribution() {
        let line = br#"{"type":"session_meta","payload":{"cwd":"/work/project","source":{"subagent":{"thread_spawn":{"parent_thread_id":"thread-parent"}}}}}"#;
        assert_eq!(
            parse_session_metadata(line),
            (
                Some("/work/project".to_string()),
                Some("thread-parent".to_string())
            )
        );
    }

    #[test]
    fn malformed_or_irrelevant_metadata_is_ignored() {
        assert_eq!(parse_session_metadata(b"not json"), (None, None));
        assert_eq!(
            parse_session_metadata(br#"{"type":"event_msg","payload":{"cwd":"/tmp"}}"#),
            (None, None)
        );
    }
}

#[cfg(test)]
fn empty_summary() -> PeriodSummary {
    PeriodSummary {
        messages: 0,
        tokens: 0,
        models: Vec::new(),
    }
}
