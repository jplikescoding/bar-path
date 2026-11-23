import { escapeHtml, parseWeightLb, toDateInput, withDate } from '../librarySupport'

// Shared lift-details fields (name, weight, date, note) for the Review save editor
// and the Library edit editor. Everything but the name is optional.

export interface LiftFields {
  name: string
  date: number
  weightLb: number | null
  note: string
}

const FIELD = 'w-full min-w-0 bg-[var(--surface-2)] border border-[var(--line-bright)] rounded-xl px-3 py-3 text-[var(--chalk)]'

export function liftFieldsHtml(v: LiftFields): string {
  return `
    <div class="flex flex-col gap-2">
      <input id="lf-name" class="${FIELD}" style="font-family:var(--font-display)" placeholder="Name this lift" value="${escapeHtml(v.name)}" />
      <div class="flex gap-2">
        <input id="lf-weight" class="${FIELD} flex-1" inputmode="decimal" placeholder="Weight (lb)" value="${v.weightLb ?? ''}" />
        <input id="lf-date" type="date" class="${FIELD} flex-1" value="${toDateInput(v.date)}" aria-label="Date" />
      </div>
      <input id="lf-note" class="${FIELD}" placeholder="Note (optional)" value="${escapeHtml(v.note)}" />
    </div>`
}

// baseDate keeps the time of day when only the date is changed.
export function readLiftFields(scope: HTMLElement, baseDate: number): LiftFields {
  const val = (id: string) => scope.querySelector<HTMLInputElement>(`#${id}`)!.value
  return {
    name: val('lf-name').trim(),
    date: withDate(baseDate, val('lf-date')),
    weightLb: parseWeightLb(val('lf-weight')),
    note: val('lf-note').trim(),
  }
}
