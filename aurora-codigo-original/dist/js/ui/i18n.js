/* Local dictionaries only: switching language never rewrites project or asset names. */
(function (root) {
  const catalog = root.AURORA_EN || {};
  const normalize = (s) => String(s).replace(/\s+/g, " ").trim();
  let language = "pt-BR";
  try {
    language =
      localStorage.getItem("aurora-language") === "en" ? "en" : "pt-BR";
  } catch {}
  function t(source, values = {}) {
    const key = normalize(source);
    let result = language === "en" ? (catalog[key] ?? key) : key;
    if (language === "en" && !Object.hasOwn(catalog, key)) {
      const prefix = [
        "Banco de sons ausente:",
        "Sample ausente na pista",
        "Recarregue o sample da pista",
        "Escolha um banco de sons para a pista",
        "Saída MIDI desconectada:",
        "Não foi possível restaurar o projeto:",
      ].find((p) => key.startsWith(p + " "));
      if (prefix)
        result = catalog[prefix] + " " + t(key.slice(prefix.length).trim());
      else {
        const progress = key.match(/^(Renderizando SoundFont…) (\d+%)$/);
        if (progress) result = catalog[progress[1]] + " " + progress[2];
      }
    }
    result = result.replace(/\{(\w+)\}/g, (match, name) =>
      Object.hasOwn(values, name) ? String(values[name]) : match,
    );
    // Fragments used around user names keep their intentional spacing.
    return (
      (String(source).match(/^\s*/)?.[0] || "") +
      result +
      (String(source).match(/\s*$/)?.[0] || "")
    );
  }
  const dynamic = new Set([
    "trackTitle",
    "title",
    "audioState",
    "status",
    "toast",
    "noteCount",
    "selection",
    "bankName",
    "sampleName",
    "scoreMeta",
    "tempoMap",
  ]);
  function mark(scope) {
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const parent = node.parentElement,
        key = normalize(node.nodeValue);
      if (
        !parent ||
        !Object.hasOwn(catalog, key) ||
        parent.closest("script,style,[data-i18n]")
      )
        continue;
      if (dynamic.has(parent.id) || parent.closest("#tracks")) continue;
      if (parent.childNodes.length === 1) parent.dataset.i18n = node.nodeValue;
      else {
        const span = document.createElement("span");
        span.dataset.i18n = node.nodeValue;
        node.replaceWith(span);
      }
    }
    for (const el of scope.querySelectorAll(
      "[title],[aria-label],[placeholder]",
    )) {
      for (const attr of ["title", "aria-label", "placeholder"]) {
        const value = el.getAttribute(attr);
        if (value && Object.hasOwn(catalog, normalize(value)))
          el.setAttribute("data-i18n-" + attr, normalize(value));
      }
    }
    apply(scope);
  }
  function apply(scope = document) {
    for (const el of scope.querySelectorAll("[data-i18n]"))
      el.textContent = t(el.dataset.i18n);
    for (const attr of ["title", "aria-label", "placeholder"])
      for (const el of scope.querySelectorAll("[data-i18n-" + attr + "]"))
        el.setAttribute(attr, t(el.getAttribute("data-i18n-" + attr)));
    document.documentElement.lang = language;
  }
  function setLanguage(value) {
    language = value === "en" ? "en" : "pt-BR";
    try {
      localStorage.setItem("aurora-language", language);
    } catch {}
    apply();
    document.dispatchEvent(
      new CustomEvent("aurora:language", { detail: language }),
    );
  }
  root.I18n = {
    t,
    mark,
    apply,
    setLanguage,
    get language() {
      return language;
    },
  };
  if (typeof document !== "undefined") mark(document.body);
})(globalThis);
