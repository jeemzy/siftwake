import { Display } from '@/registry/hardware/ui/display';
import type { ProbeReading } from './world';

export default function ProbeCartridge({
  active,
  reading,
}: {
  active: boolean;
  reading: ProbeReading | null;
}) {
  const pressure = reading?.pressure ?? 0;
  const fields = [
    ['Temperature', reading ? String(reading.temperature) : '—', '°C'],
    ['Pressure', reading ? (pressure > 0 ? '+' : '') + pressure.toFixed(2) : '—', 'sim'],
    ['Airflow', reading ? reading.speed.toFixed(2) : '—', reading?.direction ?? ''],
  ];
  return (
    <div className="sw-bay" data-open={active} aria-hidden={!active}>
      <div className="sw-cartridge">
        <Display aspect="auto">
          <div className="sw-readings" role="group" aria-label="Probe readings">
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
        </Display>
      </div>
    </div>
  );
}
