import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { confirm } from '@/lib/confirm';
import { useGroup } from '@/state/app';
import { member, prettyDate, taskOf } from '@/state/select';
import { Avatar, Button, Card, Empty, Field, Header, Photo, Screen, Section, T } from '@/ui/components';
import { StatusPill, usePhoto } from '@/ui/parts';
import { colors, space } from '@/ui/theme';

/** One check-in: the photo, the explanation, approve or question, and the comment thread. */
export default function Proof() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { backend, snap, me, today, run, blocked } = useGroup();
  const checkin = snap.checkins.find((c) => c.id === id);
  const uri = usePhoto(checkin?.photoPath ?? null);
  const [comment, setComment] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');

  if (!checkin) {
    return (
      <Screen>
        <Header title="Proof" />
        <Empty icon="image-outline" title="Check-in not found" body="It may be older than the history kept on this device." />
      </Screen>
    );
  }
  const owner = member(snap, checkin.ownerId);
  const task = taskOf(snap, checkin);
  const mine = checkin.ownerId === me.id;
  const comments = snap.comments.filter((c) => c.checkinId === checkin.id && !blocked.includes(c.authorId));
  const reviews = snap.verifications.filter((v) => v.checkinId === checkin.id);
  const myReview = reviews.find((v) => v.reviewerId === me.id);
  const time = new Date(checkin.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: me.timezone });

  const question = async () => {
    const ok = await run(async () => {
      await backend.reviewCheckin(checkin.id, 'question');
      if (comment.trim()) await backend.addComment(checkin.id, comment);
    }, 'Questioned. They can explain or retake it.');
    if (ok) setComment('');
  };

  const sendReport = async () => {
    const ok = await run(() => backend.report({ targetUserId: owner.id, checkinId: checkin.id, reason }), 'Report sent. We review reports within 24 hours.');
    if (ok) { setReporting(false); setReason(''); }
  };

  const block = async () => {
    if (await confirm(`Block ${owner.displayName}?`, 'You will no longer see their check-ins or comments, and they cannot set tasks for you. They are not told.', 'Block', true)) {
      if (await run(() => backend.block(owner.id), `${owner.displayName} is blocked`)) router.back();
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={task?.title ?? 'Proof'} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Avatar name={owner.displayName} color={owner.avatarColor} />
        <View style={{ flex: 1 }}>
          <T v="label">{mine ? 'You' : owner.displayName}</T>
          <T v="small" color={colors.muted}>{prettyDate(checkin.date, today)} at {time}</T>
        </View>
        <StatusPill status={checkin.status} />
      </View>

      <Photo uri={uri} seed={checkin.id} label={`Proof photo from ${owner.displayName}`} />
      <Card>
        <T v="small" color={colors.muted}>What they did</T>
        <T>{checkin.explanation}</T>
      </Card>

      {!mine && (
        <Card tone={checkin.status === 'submitted' ? 'amber' : undefined}>
          <T v="label">
            {myReview ? `You ${myReview.decision === 'approve' ? 'approved' : 'questioned'} this. You can change your mind.` : 'Does this prove the task was done?'}
          </T>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button kind="success" icon="checkmark" label="Approve" style={{ flex: 1 }} onPress={() => run(() => backend.reviewCheckin(checkin.id, 'approve'), 'Approved')} testID="approve" />
            <Button kind="ghost" icon="help" label="Question" style={{ flex: 1, backgroundColor: colors.card }} onPress={question} testID="question" />
          </View>
          <T v="small" color={colors.muted}>A questioned check-in does not count until it is approved or retaken. Add a comment below to say what is missing.</T>
        </Card>
      )}

      {mine && checkin.status === 'questioned' && checkin.date === today && (
        <Card tone="red">
          <T v="label">A friend questioned this</T>
          <T v="small">Explain in the comments, or retake the photo. It does not count until it is approved.</T>
          <Button small icon="camera" label="Retake proof" onPress={() => router.push({ pathname: '/checkin/[taskId]', params: { taskId: checkin.taskId } })} />
        </Card>
      )}

      <Section title="Comments">
        {comments.length === 0 && <T v="small" color={colors.muted}>No comments yet.</T>}
        {comments.map((c) => {
          const who = member(snap, c.authorId);
          return (
            <View key={c.id} style={{ flexDirection: 'row', gap: space.sm }}>
              <Avatar name={who.displayName} color={who.avatarColor} size={30} />
              <Card style={{ flex: 1, padding: space.md, gap: 2 }}>
                <T v="small" color={colors.muted}>{c.authorId === me.id ? 'You' : who.displayName}</T>
                <T>{c.body}</T>
              </Card>
            </View>
          );
        })}
        <Field label="Add a comment" value={comment} onChangeText={setComment} maxLength={500} placeholder="Say something" testID="comment" />
        <Button small kind="soft" icon="chatbubble-outline" label="Post comment" disabled={!comment.trim()} onPress={async () => { if (await run(() => backend.addComment(checkin.id, comment))) setComment(''); }} />
      </Section>

      {!mine && (
        <Section title="Safety">
          {reporting ? (
            <Card>
              <Field label="What is wrong with this check-in?" value={reason} onChangeText={setReason} multiline maxLength={500} placeholder="e.g. The photo is offensive" />
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button small kind="danger" label="Send report" style={{ flex: 1 }} disabled={!reason.trim()} onPress={sendReport} />
                <Button small kind="ghost" label="Cancel" style={{ flex: 1 }} onPress={() => setReporting(false)} />
              </View>
            </Card>
          ) : (
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button small kind="ghost" icon="flag-outline" label="Report" style={{ flex: 1 }} onPress={() => setReporting(true)} testID="report" />
              <Button small kind="ghost" icon="hand-left-outline" label={`Block ${owner.displayName}`} style={{ flex: 1 }} onPress={block} />
            </View>
          )}
        </Section>
      )}
    </Screen>
  );
}
