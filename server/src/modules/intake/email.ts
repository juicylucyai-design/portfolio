import { simpleParser } from 'mailparser';

/** Decodes a raw .eml file into plain text Claude can read, with header context prepended.
 *  mailparser derives `text` from the HTML part when a message has no text/plain part. */
export async function emailToText(raw: Buffer): Promise<string> {
  const parsed = await simpleParser(raw);
  const header = [
    `From: ${parsed.from?.text ?? 'unknown'}`,
    `Date: ${parsed.date ? parsed.date.toISOString() : 'unknown'}`,
    `Subject: ${parsed.subject ?? 'unknown'}`,
  ].join('\n');
  const body = (parsed.text ?? '').trim() || '(no readable body)';
  return `${header}\n\n${body}`;
}
