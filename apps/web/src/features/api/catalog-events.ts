export function catalogChanged() {
  window.dispatchEvent(new Event('catalog:changed'));
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('docampo-catalog');
    channel.postMessage({ consultar: true });
    channel.close();
  }
}
export function onCatalogRefresh(refresh: () => void) {
  const visible = () => {
    if (document.visibilityState === 'visible') refresh();
  };
  const channel =
    typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('docampo-catalog');
  if (channel) channel.onmessage = refresh;
  window.addEventListener('catalog:changed', refresh);
  window.addEventListener('focus', visible);
  window.addEventListener('online', visible);
  document.addEventListener('visibilitychange', visible);
  return () => {
    channel?.close();
    window.removeEventListener('catalog:changed', refresh);
    window.removeEventListener('focus', visible);
    window.removeEventListener('online', visible);
    document.removeEventListener('visibilitychange', visible);
  };
}
