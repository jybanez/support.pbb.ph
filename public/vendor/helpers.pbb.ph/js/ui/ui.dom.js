export function createElement(tagName, config = {}) {
  const element = document.createElement(tagName);
  if (config.className) {
    element.className = config.className;
  }
  if (config.text !== undefined && config.text !== null) {
    element.textContent = String(config.text);
  }
  if (config.html !== undefined && config.html !== null) {
    element.innerHTML = String(config.html);
  }
  if (config.attrs && typeof config.attrs === "object") {
    Object.keys(config.attrs).forEach((key) => {
      const value = config.attrs[key];
      if (value !== undefined && value !== null) {
        element.setAttribute(key, String(value));
      }
    });
  }
  if (config.dataset && typeof config.dataset === "object") {
    Object.keys(config.dataset).forEach((key) => {
      const value = config.dataset[key];
      if (value !== undefined && value !== null) {
        element.dataset[key] = String(value);
      }
    });
  }
  return element;
}

export function clearNode(node) {
  if (node && node.nodeType === 1) {
    node.innerHTML = "";
  }
}
