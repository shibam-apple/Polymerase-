import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming, ZoomIn } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { fmtVital, gridModel, itemHistory, readiness, vitalFields, vitalNote, withWater } from '../state/selectors';
import { fmtHours, sleepHours } from '../state/health';
import { dayKey } from '../state/seed';
import { useStore } from '../state/store';
import { C, fill, ink, LONG_NAMES, MOODS, VMETA } from '../theme';
import { ease, SNAP } from '../theme/motion';
import { Dot, PressableScale } from '../ui/controls';
import { Slider } from '../ui/Slider';
import { T } from '../ui/Text';
import { MoodBlob } from '../viz/MoodBlob';

const APath = Animated.createAnimatedComponent(Path);

export function QuickSheet() {
  const { s, a } = useStore();
  const dueMeds = s.items.filter(i => i.p === 'med' && !i.done && i.part <= 1);
  const firstMind = s.items.find(i => i.p === 'mind' && !i.done);
  const tiles = [
    { title: 'Mood', sub: 'How are you?', color: C.mind, go: () => a.openSheet('mood', { moodFor: firstMind?.id ?? null }) },
    { title: 'Water', sub: `${s.water} of 8 · +1`, color: '#32ade6', go: () => a.addWater(true) },
    { title: 'Meds', sub: dueMeds.length ? `${dueMeds.length} due now` : 'Next at 19:00', color: C.med, go: () => { a.closeSheet(); if (dueMeds.length) a.setDone(dueMeds.map(i => i.id), true, `${dueMeds.map(i => i.title).join(', ')} logged`); else a.toast('No doses due now'); } },
    { title: 'Sleep', sub: 'Last night', color: C.sleep, go: () => a.openSheet('sleep') },
    { title: 'Meditated', sub: '10 min', color: C.habit, go: () => { a.closeSheet(); a.setDone([7], true, 'Meditate logged'); } },
    { title: 'Blood pressure', sub: `Last ${s.vitals.bp.v.join('/')}`, color: VMETA.bp.color, go: () => a.openVital('bp') },
    { title: 'Weight', sub: `Last ${s.vitals.weight.v[0].toFixed(1)} kg`, color: VMETA.weight.color, go: () => a.openVital('weight') },
  ];
  return (
    <View style={{ gap: 14 }}>
      <T size={21} weight="700" track={-0.02}>Quick log</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {tiles.map((q, i) => (
          <Animated.View key={q.title} entering={FadeIn.delay(i * 30).duration(250)} style={{ width: '48.4%' }}>
            <PressableScale onPress={q.go} style={{ minHeight: 100, borderRadius: 22, padding: 14, backgroundColor: 'rgba(255,255,255,.8)', justifyContent: 'space-between' }}>
              <Dot color={q.color} />
              <View style={{ gap: 1 }}>
                <T size={16} weight="600">{q.title}</T>
                <T size={13} tone="ink2">{q.sub}</T>
              </View>
            </PressableScale>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const TAGS = ['Work', 'Family', 'Rested', 'Tired', 'Anxious', 'Calm'];

export function MoodSheet() {
  const { a } = useStore();
  const [mood, setMood] = useState(4);
  const [tags, setTags] = useState<Record<string, boolean>>({});
  const m = MOODS[mood - 1];
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <T size={21} weight="700" track={-0.02} style={{ alignSelf: 'flex-start' }}>How do you feel?</T>
      <View style={{ height: 170, alignItems: 'center', justifyContent: 'center' }}><MoodBlob mood={mood} /></View>
      <Animated.View key={m.label} entering={FadeIn.duration(250)}><T size={22} weight="700" track={-0.02} color={m.text}>{m.label}</T></Animated.View>
      <View style={{ alignSelf: 'stretch', flexDirection: 'row', marginTop: 8 }}>
        <Slider value={mood} min={1} max={5} step={1} onChange={setMood} label="Mood" />
      </View>
      <View style={{ alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between' }}>
        <T size={12} tone="ink3">Low</T><T size={12} tone="ink3">Great</T>
      </View>
      <View style={{ alignSelf: 'stretch', flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {TAGS.map(t => {
          const on = !!tags[t];
          return (
            <PressableScale key={t} onPress={() => setTags(x => ({ ...x, [t]: !on }))} accessibilityState={{ selected: on }} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18, backgroundColor: on ? ink[1] : fill.tertiary }}>
              <T size={14} weight="500" color={on ? '#fff' : ink[1]}>{t}</T>
            </PressableScale>
          );
        })}
      </View>
      <PressableScale scaleTo={0.97} onPress={() => a.saveMood(mood)} style={{ alignSelf: 'stretch', marginTop: 16, height: 52, borderRadius: 26, backgroundColor: ink[1], alignItems: 'center', justifyContent: 'center' }}>
        <T size={17} weight="600" color="#fff">Log mood</T>
      </PressableScale>
    </View>
  );
}

export function VitalSheet() {
  const { s, a } = useStore();
  const k = s.vitalKey, meta = VMETA[k], hasLast = s.vitals[k].v.length > 0;
  // First entry starts from a typical value; after that, from the last reading.
  const last = hasLast ? s.vitals[k].v : k === 'bp' ? [120, 80] : [70];
  const [draft, setDraft] = useState<number[]>([...last]);
  const [saving, setSaving] = useState(false);
  const fields = vitalFields(k, last), f0 = fields[0];
  const { note, color: noteColor } = vitalNote(k, draft, last);
  const bump = useSharedValue(1);
  const hold = useRef<{ d?: ReturnType<typeof setTimeout>; i?: ReturnType<typeof setInterval> }>({});
  const nudge = (idx: number, dir: number) => {
    setDraft(d => { const n = [...d], st = fields[idx].step; n[idx] = Math.round(Math.min(fields[idx].max, Math.max(fields[idx].min, n[idx] + dir * st)) * 10) / 10; return n; });
    bump.value = withSequence(withTiming(1.03, { duration: 60 }), withSpring(1, SNAP));
  };
  const stopHold = () => { clearTimeout(hold.current.d); clearInterval(hold.current.i); };
  const startHold = (idx: number, dir: number) => { stopHold(); nudge(idx, dir); hold.current.d = setTimeout(() => { hold.current.i = setInterval(() => nudge(idx, dir), 70); }, 380); };
  useEffect(() => stopHold, []);
  const save = (v: number[]) => { if (saving) return; setDraft([...v]); setSaving(true); setTimeout(() => a.saveVital(k, v), 650); };
  const bumpStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  const tPos = Math.round(((draft[0] - f0.min) / (f0.max - f0.min)) * 40);

  const btnW = useSharedValue(1);
  useEffect(() => { btnW.value = withTiming(saving ? 0 : 1, { duration: 260, easing: ease.springBar }); }, [saving, btnW]);
  const [rowW, setRowW] = useState(0);
  const btnStyle = useAnimatedStyle(() => ({ width: 52 + (rowW - 52) * btnW.value }));
  const dash = useSharedValue(24);
  useEffect(() => { if (saving) dash.value = withDelay(120, withTiming(0, { duration: 350 })); }, [saving, dash]);
  const checkProps = useAnimatedProps(() => ({ strokeDashoffset: dash.value }));

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Dot size={8} color={meta.color} /><T size={13} weight="600" tone="ink2">{meta.name}</T></View>
          <T size={13} tone="ink3">{hasLast ? `Last · ${fmtVital(k, last)} · ${s.vitals[k].when.toLowerCase()}` : 'First reading · adjust to your value'}</T>
        </View>
        {hasLast && (
          <PressableScale scaleTo={0.92} onPress={() => save(last)} style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: fill.tertiary, justifyContent: 'center' }}>
            <T size={13} weight="600" color={ink[1]}>Same as last</T>
          </PressableScale>
        )}
      </View>
      <View style={{ alignItems: 'center', gap: 6, paddingTop: 10, paddingBottom: 4 }}>
        <Animated.View style={bumpStyle}>
          <T size={56} weight="700" track={-0.04} lh={1} tabular>{fmtVital(k, draft)}<T size={18} weight="600" tone="ink3"> {meta.unit}</T></T>
        </Animated.View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 12, borderRadius: 12, backgroundColor: 'rgba(120,120,128,.1)' }}>
          <Dot size={7} color={noteColor} /><T size={13} weight="500">{note}</T>
        </View>
      </View>
      <View style={{ gap: 6, paddingHorizontal: 6 }}>
        <View style={{ height: 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          {Array.from({ length: 41 }, (_, i) => {
            const d = Math.abs(i - tPos), on = d === 0, near = d <= 2;
            return <View key={i} style={{ width: 2, height: on ? 40 : i % 5 === 0 ? 24 : 14, borderRadius: 1, backgroundColor: on ? meta.color : near ? meta.color + '88' : 'rgba(120,120,128,.35)' }} />;
          })}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T size={11} weight="600" tone="ink3" tabular>{f0.min}</T><T size={11} weight="600" tone="ink3" tabular>{f0.max}</T>
        </View>
      </View>
      {fields.map((fd, idx) => (
        <View key={fd.label} style={{ gap: 4 }}>
          {k === 'bp' && <T size={12} weight="600" tone="ink2">{fd.label}</T>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <StepButton sign={-1} onIn={() => startHold(idx, -1)} onOut={stopHold} onTap={() => nudge(idx, -1)} />
            <Slider neutral value={draft[idx]} min={fd.min} max={fd.max} step={fd.step} label={fd.label} onChange={v => setDraft(d => { const n = [...d]; n[idx] = v; return n; })} />
            <StepButton sign={1} onIn={() => startHold(idx, 1)} onOut={stopHold} onTap={() => nudge(idx, 1)} />
          </View>
        </View>
      ))}
      <T size={12} tone="ink3" center>Drag, tap or hold ± to adjust</T>
      <View onLayout={e => setRowW(e.nativeEvent.layout.width)} style={{ alignItems: 'center' }}>
        <Pressable onPress={() => save(draft)} accessibilityLabel="Save">
          <Animated.View style={[{ height: 52, borderRadius: 26, backgroundColor: saving ? '#34c759' : ink[1], alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, rowW ? btnStyle : { width: '100%' }]}>
            {saving ? (
              <Svg width={22} height={22} viewBox="0 0 24 24"><APath d="M20 6 9 17l-5-5" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="24" animatedProps={checkProps} /></Svg>
            ) : <T size={17} weight="600" color="#fff">Save</T>}
          </Animated.View>
        </Pressable>
      </View>
      {k === 'bp' && <T size={11} tone="ink3" center lh={1.4}>Cuff readings also calibrate the app’s blood-pressure estimates.</T>}
    </View>
  );
}

/** ± button: press-and-hold repeats (380 ms delay, then every 70 ms). `onTap` covers platforms
 *  (web) that deliver a quick click as `onPress` without a preceding `onPressIn`. */
function StepButton({ sign, onIn, onOut, onTap }: { sign: 1 | -1; onIn: () => void; onOut: () => void; onTap: () => void }) {
  const began = useRef(false);
  return (
    <PressableScale scaleTo={0.88}
      onPressIn={() => { began.current = true; onIn(); }}
      onPressOut={onOut}
      onPress={() => { if (!began.current) onTap(); began.current = false; }} accessibilityLabel={sign > 0 ? 'Increase' : 'Decrease'} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,.9)', boxShadow: '0 1px 4px rgba(0,0,0,.08)', alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={16} height={16} viewBox="0 0 24 24"><Path d={sign > 0 ? 'M5 12h14M12 5v14' : 'M5 12h14'} stroke={ink[1]} strokeWidth={2.6} strokeLinecap="round" /></Svg>
    </PressableScale>
  );
}

export function ItemSheet({ now }: { now: Date }) {
  const { s, a } = useStore();
  const items = withWater(s.items, s.water);
  const it = items.find(i => i.id === s.itemId) ?? items[0];
  const r = readiness(items), todayIdx = gridModel(items, 'all', now).todayIdx;
  const days = itemHistory(it, todayIdx), kept = days.filter(Boolean).length;
  const cta = it.auto ? 'Close' : it.done ? 'Undo' : it.p === 'mind' ? 'Check in' : 'Log';
  const act = () => {
    if (it.auto) { a.closeSheet(); return; }
    if (!it.done && it.p === 'mind') { a.openSheet('mood', { moodFor: it.id }); return; }
    a.closeSheet();
    a.setDone([it.id], !it.done, `${it.title} logged`);
  };
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Dot size={8} color={C[it.p]} /><T size={13} weight="600" tone="ink2">{LONG_NAMES[it.p]} · {it.time}</T></View>
        <T size={24} weight="700" track={-0.02}>{it.title}</T>
        <T size={14} tone="ink2">{it.detail}</T>
      </View>
      <View style={{ gap: 8, padding: 14, borderRadius: 18, backgroundColor: 'rgba(255,255,255,.8)' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T size={12} weight="600" tone="ink2">Last 14 days</T><T size={12} weight="600">{kept} of 14</T></View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {days.map((ok, k) => <Animated.View key={k} entering={ZoomIn.delay(k * 15).duration(220).easing(ease.springSoft)} style={{ flex: 1, aspectRatio: 1, borderRadius: 999, backgroundColor: ok ? C[it.p] : 'rgba(120,120,128,.18)' }} />)}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 }}>
        <T size={14} color={ink.body} style={{ flex: 1 }}>{it.done ? 'Counted in today’s readiness' : 'Adds to readiness when logged'}</T>
        <T size={14} weight="700" tabular>{it.done ? '' : 'up to +'}{r.gain(it.p)}</T>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <PressableScale scaleTo={0.97} onPress={act} style={{ flex: 1, height: 50, borderRadius: 25, backgroundColor: ink[1], alignItems: 'center', justifyContent: 'center' }}><T size={16} weight="600" color="#fff">{cta}</T></PressableScale>
        <PressableScale scaleTo={0.97} onPress={() => a.snooze(it)} style={{ flex: 1, height: 50, borderRadius: 25, backgroundColor: fill.tertiary, alignItems: 'center', justifyContent: 'center' }}><T size={16} weight="500" color={ink[1]}>Remind in 30 min</T></PressableScale>
      </View>
    </View>
  );
}

export function ShareSheet() {
  const { s, a } = useStore();
  const n = Object.values(s.rep).filter(Boolean).length;
  const opts: [string, string, string][] = [['Send to Dr. Patel', 'Secure link, expires in 7 days', 'Sent to Dr. Patel'], ['Download PDF', 'Save to this device', 'PDF downloaded'], ['Copy link', 'Paste anywhere', 'Link copied']];
  return (
    <View style={{ gap: 14 }}>
      <View><T size={21} weight="700" track={-0.02}>Share report</T><T size={13} tone="ink2">PDF · 1 page · {n} sections</T></View>
      <View style={{ borderRadius: 18, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,.8)' }}>
        {opts.map(([label, sub, msg], i) => (
          <Pressable key={label} onPress={() => { a.closeSheet(); a.toast(msg); }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 56, backgroundColor: pressed ? 'rgba(120,120,128,.08)' : 'transparent' })}>
            <View style={{ flex: 1, paddingVertical: 10, borderBottomWidth: i === 2 ? 0 : 0.5, borderBottomColor: 'rgba(60,60,67,.14)' }}>
              <T size={16} weight="500">{label}</T><T size={12} tone="ink2">{sub}</T>
            </View>
            <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="m9 18 6-6-6-6" fill="none" stroke={ink[3]} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" /></Svg>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Label + value with − / + (press and hold to repeat). */
function Stepper({ label, value, onStep }: { label: string; value: string; onStep: (dir: 1 | -1) => void }) {
  const hold = useRef<{ d?: ReturnType<typeof setTimeout>; i?: ReturnType<typeof setInterval> }>({});
  const stop = () => { clearTimeout(hold.current.d); clearInterval(hold.current.i); };
  const begin = (dir: 1 | -1) => { stop(); onStep(dir); hold.current.d = setTimeout(() => { hold.current.i = setInterval(() => onStep(dir), 90); }, 380); };
  useEffect(() => stop, []);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
      <T size={15} weight="500" style={{ flex: 1 }}>{label}</T>
      <StepButton sign={-1} onIn={() => begin(-1)} onOut={stop} onTap={() => onStep(-1)} />
      <T size={20} weight="700" tabular center style={{ minWidth: 86 }}>{value}</T>
      <StepButton sign={1} onIn={() => begin(1)} onOut={stop} onTap={() => onStep(1)} />
    </View>
  );
}

const QUALITY = ['Poor', 'Fair', 'OK', 'Good', 'Great'];
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const toHHMM = (min: number) => { const m = ((min % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

/** Log last night: bedtime and wake time in 15-minute steps, plus how it felt. */
export function SleepSheet() {
  const { s, a } = useStore();
  const prev = s.sleepLog[s.sleepLog.length - 1];
  const [bed, setBed] = useState(prev?.bed ?? '23:00');
  const [wake, setWake] = useState(prev?.wake ?? '07:00');
  const [quality, setQuality] = useState(prev?.quality ?? 3);
  const hours = sleepHours(bed, wake);
  return (
    <View style={{ gap: 12 }}>
      <View>
        <T size={21} weight="700" track={-0.02}>Last night</T>
        <T size={13} tone="ink2">Feeds your recovery score and health age</T>
      </View>
      <View style={{ alignItems: 'center', paddingVertical: 6 }}>
        <T size={44} weight="700" track={-0.04} tabular>{fmtHours(hours)}</T>
        <T size={13} tone="ink3">your target is {s.profile.sleepTargetH} h</T>
      </View>
      <Stepper label="Went to sleep" value={bed} onStep={d => setBed(b => toHHMM(toMin(b) + d * 15))} />
      <Stepper label="Woke up" value={wake} onStep={d => setWake(w => toHHMM(toMin(w) + d * 15))} />
      <T size={13} weight="600" tone="ink2" style={{ marginTop: 4 }}>How did you sleep?</T>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {QUALITY.map((q, i) => {
          const on = quality === i + 1;
          return (
            <PressableScale key={q} onPress={() => setQuality(i + 1)} accessibilityState={{ selected: on }} style={{ flex: 1, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? ink[1] : fill.tertiary }}>
              <T size={13} weight="600" color={on ? '#fff' : ink[1]}>{q}</T>
            </PressableScale>
          );
        })}
      </View>
      <PressableScale scaleTo={0.97} onPress={() => a.saveSleep({ date: dayKey(), bed, wake, hours, quality })} style={{ marginTop: 8, height: 52, borderRadius: 26, backgroundColor: ink[1], alignItems: 'center', justifyContent: 'center' }}>
        <T size={17} weight="600" color="#fff">Save</T>
      </PressableScale>
    </View>
  );
}

/** Age, sex, height and sleep target: needed for health age and the sleep score. Stays on the phone. */
export function ProfileSheet() {
  const { s, a } = useStore();
  const p = s.profile;
  const [age, setAge] = useState(p.age ?? 35);
  const [sex, setSex] = useState<typeof p.sex>(p.sex);
  const [height, setHeight] = useState(p.heightCm ?? 170);
  const [target, setTarget] = useState(p.sleepTargetH);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return (
    <View style={{ gap: 10 }}>
      <View>
        <T size={21} weight="700" track={-0.02}>Your profile</T>
        <T size={13} tone="ink2">Used for health age and sleep scoring. Stays on this phone.</T>
      </View>
      <Stepper label="Age" value={`${age}`} onStep={d => setAge(v => clamp(v + d, 18, 100))} />
      <Stepper label="Height" value={`${height} cm`} onStep={d => setHeight(v => clamp(v + d, 130, 220))} />
      <Stepper label="Sleep target" value={`${target} h`} onStep={d => setTarget(v => clamp(v + d * 0.5, 6, 10))} />
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
        {([['female', 'Female'], ['male', 'Male'], [null, 'Prefer not to say']] as const).map(([k, label]) => {
          const on = sex === k;
          return (
            <PressableScale key={label} onPress={() => setSex(k)} accessibilityState={{ selected: on }} style={{ flex: k ? 1 : 1.6, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? ink[1] : fill.tertiary }}>
              <T size={13} weight="600" color={on ? '#fff' : ink[1]}>{label}</T>
            </PressableScale>
          );
        })}
      </View>
      <PressableScale scaleTo={0.97} onPress={() => a.saveProfile({ age, sex, heightCm: height, sleepTargetH: target })} style={{ marginTop: 10, height: 52, borderRadius: 26, backgroundColor: ink[1], alignItems: 'center', justifyContent: 'center' }}>
        <T size={17} weight="600" color="#fff">Save</T>
      </PressableScale>
    </View>
  );
}
