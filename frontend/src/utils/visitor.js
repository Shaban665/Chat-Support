
import api from "../services/api";

const getVisitorStorageKey = (publicKey) => {
  return `bulkchat_visitor_${publicKey}`;
};

export const getVisitorId = (publicKey) => {
  if (!publicKey) {
    throw new Error("Widget public key is missing");
  }

  const storageKey = getVisitorStorageKey(publicKey);

  let visitorId = localStorage.getItem(storageKey);

  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem(storageKey, visitorId);
  }

  return visitorId;
};

export const trackVisitor = async (
  publicKey,
  visitorId,
  parentInfo
) => {
  if (!publicKey || !visitorId) {
    throw new Error("Widget public key and visitor ID are required");
  }

  const { parentOrigin, currentPage, referrer = "" } = parentInfo || {};

  if (!parentOrigin || !currentPage) {
    throw new Error("Parent website information is missing");
  }

  const response = await api.post("/visitors/track", {
    publicKey,
    visitorId,
    parentOrigin,
    currentPage,
    referrer,
  });

  return response.data;
};
