// TEMPORARY bridge used only for the owner-authorized cleanup of one exact test record.
export async function onRequestGet({ request }) {
  const target = new URL('/api/internal/purge-crafford-test-record', request.url);
  return Response.redirect(target.toString(), 302);
}
