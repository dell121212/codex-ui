/** Desktop Entry string escaping, shared by the renderer and Node installer. */
export function desktopValue(value) {
  if (/[\r\n\0]/.test(value)) throw new Error('桌面入口路径包含无效字符');
  return value.replace(/\\/g, '\\\\');
}

/** Exec has argument quoting followed by the Desktop Entry string escaping. */
export function desktopExecQuote(value) {
  const quoted = value.replace(/([\\"`$])/g, '\\$1').replace(/%/g, '%%');
  return desktopValue(`"${quoted}"`);
}

export function desktopExecCommand(executable) {
  if (executable.includes('=')) throw new Error('桌面入口程序路径不能包含等号');
  // GIO resolves argv[0] before expanding %%.
  // env keeps the actual path in an argument where field expansion works.
  return `${executable.includes('%') ? '/usr/bin/env ' : ''}${desktopExecQuote(executable)}`;
}
