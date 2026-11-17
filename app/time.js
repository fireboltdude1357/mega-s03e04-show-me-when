const formatters = new Map();

function formatterFor(locale, timeZone) {
  const key = `${locale ?? ''}|${timeZone ?? ''}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'short',
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

/** Display text for an ISO UTC time in the viewer's zone and locale order. Defaults: browser locale and zone. */
export function formatTime(iso, { locale, timeZone } = {}) {
  if (typeof iso !== 'string' || iso === '') return iso;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return formatterFor(locale, timeZone).format(date);
}
