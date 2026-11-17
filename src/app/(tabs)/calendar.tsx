import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { addDays, dueOn, scheduledOn, weekday, type DateStr } from '@domain';

import { useGroup } from '@/state/app';
import { member, prettyDate, windowLabel } from '@/state/select';
import { Button, Card, Empty, Pill, Screen, Section, T } from '@/ui/components';
import { CheckinRow } from '@/ui/parts';
import { colors, MIN_TOUCH, radius, space } from '@/ui/theme';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function CalendarTab() {
  const { snap, me, today, blocked } = useGroup();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState<DateStr>(today);

  const cells = useMemo(() => {
    const first = `${month}-01`;
    const start = addDays(first, -((weekday(first) + 6) % 7)); // back to Monday
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [month]);
  const weeks = cells.slice(35).some((d) => d.startsWith(month)) ? 6 : 5;

  const shift = (n: number) => {
    const [y, m] = month.split('-').map(Number) as [number, number];
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(d.toISOString().slice(0, 7));
  };

  // Past days show what happened; today and future days show what is scheduled.
  const mark = (d: DateStr) => {
    const mineDone = snap.checkins.some((c) => c.ownerId === me.id && c.date === d && c.status !== 'questioned');
    const struck = snap.strikes.some((s) => s.userId === me.id && s.date === d && s.outcome !== 'excused');
    const dated = snap.tasks.some((t) => t.schedule.kind === 'once' && t.schedule.date === d && t.status !== 'declined' && t.status !== 'ended');
    const due = d >= today && snap.tasks.some((t) => t.ownerId === me.id && t.status === 'active' && scheduledOn(t, d) && (t.activeFrom ?? d) <= d);
    return { mineDone, struck, dated, due };
  };

  const dayTasks = snap.tasks.filter((t) =>
    t.status === 'active' && (t.ownerId === me.id || t.schedule.kind === 'once') && !blocked.includes(t.ownerId) &&
    (selected >= today ? scheduledOn(t, selected) && (t.activeFrom ?? selected) <= selected : dueOn(t, selected)),
  );
  const dayCheckins = snap.checkins.filter((c) => c.date === selected && !blocked.includes(c.ownerId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const [y, m] = month.split('-').map(Number) as [number, number];

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <T v="title" style={{ flex: 1 }} accessibilityRole="header">{MONTHS[m - 1]} {y}</T>
        <Arrow icon="chevron-back" label="Previous month" onPress={() => shift(-1)} />
        <Arrow icon="chevron-forward" label="Next month" onPress={() => shift(1)} />
      </View>

      <Card style={{ padding: space.sm, gap: 2 }}>
        <View style={{ flexDirection: 'row' }}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <T key={i} v="small" color={colors.muted} center style={{ flex: 1, paddingVertical: 4 }}>{d}</T>
          ))}
        </View>
        {Array.from({ length: weeks }, (_, w) => (
          <View key={w} style={{ flexDirection: 'row' }}>
            {cells.slice(w * 7, w * 7 + 7).map((d) => {
              const inMonth = d.startsWith(month);
              const k = mark(d);
              const isSel = d === selected;
              const sunday = weekday(d) === 0;
              const bits = [k.mineDone && 'checked in', k.struck && 'strike', k.dated && 'dated task', k.due && !k.mineDone && 'task due', sunday && 'finish line'].filter(Boolean).join(', ');
              return (
                <Pressable
                  key={d}
                  onPress={() => { setSelected(d); if (!inMonth) setMonth(d.slice(0, 7)); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSel }}
                  accessibilityLabel={`${prettyDate(d)}${d === today ? ', today' : ''}${bits ? ', ' + bits : ''}`}
                  style={{ flex: 1, minHeight: MIN_TOUCH + 4, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: isSel ? colors.amberSoft : 'transparent', borderWidth: 2, borderColor: d === today ? colors.amber : 'transparent' }}>
                  <T v={inMonth ? 'label' : 'body'} color={k.struck ? colors.red : inMonth ? colors.text : '#64748B'}>{Number(d.slice(8))}</T>
                  <View style={{ flexDirection: 'row', gap: 3, height: 8, alignItems: 'center' }}>
                    {k.mineDone && <Dot color={colors.green} />}
                    {k.struck && <Dot color={colors.red} />}
                    {k.dated && <Dot color={colors.blue} />}
                    {k.due && !k.mineDone && <Dot color={colors.amberBright} />}
                    {sunday && <Ionicons name="flag" size={9} color={colors.muted} />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, padding: space.sm }}>
          <Legend color={colors.green} label="Checked in" />
          <Legend color={colors.amberBright} label="Due" />
          <Legend color={colors.blue} label="Dated task" />
          <Legend color={colors.red} label="Strike" />
        </View>
      </Card>

      <Section
        title={prettyDate(selected, today)}
        action={selected >= today ? <Button small kind="soft" icon="add" label="Dated task" onPress={() => router.push({ pathname: '/task/new', params: { date: selected } })} /> : undefined}>
        {weekday(selected) === 0 && <Pill tone="amber" icon="flag" label="Weekly finish line" />}
        {dayTasks.length === 0 && dayCheckins.length === 0 && (
          <Card>
            <Empty icon="calendar-clear-outline" title="Nothing here" body={selected >= today ? 'Add an assignment, a test or any one-off task with a due date.' : 'No check-ins were made on this day.'} />
          </Card>
        )}
        {dayTasks.length > 0 && (
          <Card>
            {dayTasks.map((t) => (
              <View key={t.id} style={{ gap: 2 }}>
                <T v="label">{t.title}</T>
                <T v="small" color={colors.muted}>
                  {t.ownerId === me.id ? 'You' : member(snap, t.ownerId).displayName} · {t.schedule.kind === 'once' ? 'due this day' : 'scheduled'} · check in {windowLabel(t)}
                </T>
              </View>
            ))}
          </Card>
        )}
        {dayCheckins.map((c) => <CheckinRow key={c.id} snap={snap} checkin={c} today={today} />)}
      </Section>
    </Screen>
  );
}

const Dot = ({ color }: { color: string }) => <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />;

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <T v="small" color={colors.muted}>{label}</T>
    </View>
  );
}

function Arrow({ icon, label, onPress }: { icon: 'chevron-back' | 'chevron-forward'; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={24} color={colors.text} />
    </Pressable>
  );
}
