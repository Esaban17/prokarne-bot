import { reply } from './bot.js';
import { sendText } from './channels/send.js';
import { saveIncoming, saveOutgoing } from './db.js';

export async function handleMessage(msg) {
  const conv = await saveIncoming(msg);
  if (!conv) return; // reintento de Meta, ya respondido
  const text = reply(msg, conv);
  await sendText(msg.channel, msg.userId, text);
  await saveOutgoing(conv.id, text);
}
