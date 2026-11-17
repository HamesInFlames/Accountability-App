import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { addDays, RULES, type DateStr, type Schedule, type TimeStr } from '@domain';

import { prettyDate } from '@/state/select';

import { Chip, Field, T } from './components';
import { colors, MIN_TOUCH, radius, space } from './theme';

export interface TaskDraft {
  title: string;
  schedule: Schedule;
  windowStart: TimeStr;
  windowEnd: TimeStr;
}

const WINDOWS: { label: string; start: TimeStr; end: TimeStr }[] = [
  { label: 'Any time', start: RULES.defaultWindowStart, end: RULES.defaultWindowEnd },
  { label: 'Morning', start: '06:00', end: '10:00' },
  { label: 'Daytime', start: '09:00', end: '18:00' },
  { label: 'Evening', start: '17:00', end: '23:00' },
];
const DAYS: [number, string][] = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const emptyDraft = (date?: DateStr): TaskDraft => ({
  title: '',
  schedule: date ? { kind: 'once', date } : { kind: 'daily' },
  windowStart: RULES.defaultWindowStart,
  windowEnd: RULES.defaultWindowEnd,
});

export function draftError(d: TaskDraft, today: DateStr): string | null {
  if (!d.title.trim()) return 'Give the task a title';
  if (d.schedule.kind === 'weekdays' && d.schedule.days.length === 0) return 'Pick at least one day';
  if (d.schedule.kind === 'once' && d.schedule.date < today) return 'Pick today or a later date';
  if (!TIME.test(d.windowStart) || !TIME.test(d.windowEnd)) return 'Write times as HH:MM, for example 07:30';
  if (d.windowStart >= d.windowEnd) return 'The window must end after it starts';
  return null;
}

/** Title, schedule and check-in window. Used for the first task, your own tasks and tasks for friends. */
export function TaskForm({ draft, onChange, today, showError }: { draft: TaskDraft; onChange: (d: TaskDraft) => void; today: DateStr; showError: boolean }) {
  const [custom, setCustom] = useState(!WINDOWS.some((w) => w.start === draft.windowStart && w.end === draft.windowEnd));
  const s = draft.schedule;
  const error = showError ? draftError(draft, today) : null;

  return (
    <View style={{ gap: space.lg }}>
      <Field label="What is the task?" value={draft.title} onChangeText={(title) => onChange({ ...draft, title })} placeholder="e.g. Gym, 30 minutes" maxLength={80} testID="task-title" />

      <View style={{ gap: space.sm }}>
        <T v="label">How often?</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          <Chip label="Every day" selected={s.kind === 'daily'} onPress={() => onChange({ ...draft, schedule: { kind: 'daily' } })} />
          <Chip label="Some days" selected={s.kind === 'weekdays'} onPress={() => onChange({ ...draft, schedule: { kind: 'weekdays', days: [1, 3, 5] } })} />
          <Chip label="One date" selected={s.kind === 'once'} onPress={() => onChange({ ...draft, schedule: { kind: 'once', date: today } })} />
        </View>
        {s.kind === 'weekdays' && (
          <View style={{ gap: space.xs }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {DAYS.map(([n, label]) => (
                <Chip
                  key={n}
                  label={label}
                  selected={s.days.includes(n)}
                  onPress={() => onChange({ ...draft, schedule: { kind: 'weekdays', days: s.days.includes(n) ? s.days.filter((x) => x !== n) : [...s.days, n] } })}
                />
              ))}
            </View>
            <T v="small" color={colors.muted}>Days you leave out are rest days. They never break the streak.</T>
          </View>
        )}
        {s.kind === 'once' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Stepper label="Earlier date" icon="remove" disabled={s.date <= today} onPress={() => onChange({ ...draft, schedule: { kind: 'once', date: addDays(s.date, -1) } })} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <T v="heading">{prettyDate(s.date, today)}</T>
              <T v="small" color={colors.muted}>{s.date}</T>
            </View>
            <Stepper label="Later date" icon="add" onPress={() => onChange({ ...draft, schedule: { kind: 'once', date: addDays(s.date, 1) } })} />
          </View>
        )}
      </View>

      <View style={{ gap: space.sm }}>
        <T v="label">Check-in window</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {WINDOWS.map((w) => (
            <Chip
              key={w.label}
              label={w.label}
              selected={!custom && draft.windowStart === w.start && draft.windowEnd === w.end}
              onPress={() => { setCustom(false); onChange({ ...draft, windowStart: w.start, windowEnd: w.end }); }}
            />
          ))}
          <Chip label="Custom" selected={custom} onPress={() => setCustom(true)} />
        </View>
        {custom ? (
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Field label="Opens" value={draft.windowStart} onChangeText={(windowStart) => onChange({ ...draft, windowStart })} placeholder="06:00" maxLength={5} keyboardType="numbers-and-punctuation" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Closes" value={draft.windowEnd} onChangeText={(windowEnd) => onChange({ ...draft, windowEnd })} placeholder="22:00" maxLength={5} keyboardType="numbers-and-punctuation" />
            </View>
          </View>
        ) : (
          <T v="small" color={colors.muted}>
            The proof photo must be taken between {draft.windowStart} and {draft.windowEnd}. A set time makes follow-through more likely.
          </T>
        )}
      </View>

      {error && <T v="small" color={colors.red} accessibilityRole="alert">{error}</T>}
    </View>
  );
}

function Stepper({ icon, label, onPress, disabled }: { icon: 'add' | 'remove'; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={{ width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
      <Ionicons name={icon} size={22} color={colors.text} />
    </Pressable>
  );
}
