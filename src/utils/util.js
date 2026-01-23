const trimObject = (obj, exceptFields = []) => {
  if (obj && typeof obj === "object") {
    if (Array.isArray(obj)) {
      return obj.map((item) => trimObject(item));
    }
    Object.keys(obj).forEach((key) => {
      if (exceptFields.includes(key)) {
        return;
      }
      if (typeof obj[key] === "string") {
        obj[key] = obj[key].trim().replace(/[ ]{2,}/g, " ");
      }
      if (typeof obj[key] === "object") {
        obj[key] = trimObject(obj[key]);
      }
    });
  }

  return obj;
};

module.exports = {
  trimObject,
};
