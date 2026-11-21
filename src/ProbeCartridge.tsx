import type { ProbeReading } from './world';

export default function ProbeCartridge({
  reading,
}: {
  reading: ProbeReading | null;
}) {
  const pressure = reading?.pressure ?? 0;
  const fields = [
    ['Temperature', reading ? String(reading.temperature) : '—', '°C'],
    ['Pressure', reading ? (pressure > 0 ? '+' : '') + pressure.toFixed(2) : '—', 'sim'],
    ['Airflow', reading ? reading.speed.toFixed(2) : '—', reading?.direction ?? ''],
  ];
  if (reading?.contents) {
    fields.push([reading.contents.label, String(reading.contents.value), reading.contents.unit]);
  }
  return (
    <div className="sw-readings" role="group" aria-label="Probe readings"
      style={{ gridTemplateColumns: `repeat(${fields.length}, minmax(0, 1fr))` }}>
      {fields.map(([label, value, unit]) => (
        <div key={label}>
          <span>{label}</span>
          <output aria-live="off" aria-label={label}>
            {value}
            <small>{unit}</small>
          </output>
        </div>
      ))}
    </div>
  );
}
