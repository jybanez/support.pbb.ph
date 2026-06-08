export function createEventBag() {
  const offs = [];

  function offByRef(ref) {
    const index = offs.indexOf(ref);
    if (index >= 0) {
      offs.splice(index, 1);
    }
    ref();
  }

  return {
    on(element, eventName, handler, options) {
      if (!element || typeof element.addEventListener !== "function") {
        return () => {};
      }
      element.addEventListener(eventName, handler, options);
      const off = () => element.removeEventListener(eventName, handler, options);
      offs.push(off);
      return () => offByRef(off);
    },
    clear() {
      offs.splice(0).forEach((off) => off());
    },
  };
}
