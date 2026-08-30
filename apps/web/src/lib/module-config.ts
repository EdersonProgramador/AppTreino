export function moduleEnabled(config: Record<string, string>, key: string, defaultEnabled = true) {
  const value = config[key];
  if (value === undefined) return defaultEnabled;
  return value !== "false";
}

export const SOCIAL_MODULE_KEYS = {
  publicar: "module_social_publicar",
  momentos: "module_social_momentos",
  clipes: "module_social_clipes",
  live: "module_social_live",
  nota: "module_social_nota"
} as const;

export function socialModuleDefaultEnabled(key: string) {
  return key === SOCIAL_MODULE_KEYS.publicar || key === SOCIAL_MODULE_KEYS.momentos;
}

export function socialModulesFromConfig(config: Record<string, string>) {
  return {
    publicar: moduleEnabled(config, SOCIAL_MODULE_KEYS.publicar, true),
    momentos: moduleEnabled(config, SOCIAL_MODULE_KEYS.momentos, true),
    clipes: moduleEnabled(config, SOCIAL_MODULE_KEYS.clipes, false),
    live: moduleEnabled(config, SOCIAL_MODULE_KEYS.live, false),
    nota: moduleEnabled(config, SOCIAL_MODULE_KEYS.nota, false)
  };
}

export function hasAnySocialCreateOption(config: Record<string, string>) {
  const modules = socialModulesFromConfig(config);
  return modules.publicar || modules.momentos || modules.clipes || modules.live || modules.nota;
}
