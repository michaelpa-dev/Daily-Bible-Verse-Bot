const test = require('node:test');
const assert = require('node:assert/strict');

const { getBookById, normalizeBookId } = require('../js/constants/books.js');
const { handleRandomWebVerse } = require('../js/api/scriptureApi.js');

function createStubFetch() {
  return async (url) => {
    const parsedUrl = new URL(url);
    const referenceText = decodeURIComponent(parsedUrl.pathname.replace(/^\//, ''));
    const match = referenceText.match(/^(.*) (\d+):(\d+)$/);
    if (!match) {
      return {
        ok: false,
        status: 400,
        json: async () => ({}),
        text: async () => 'bad reference',
      };
    }

    const bookPart = match[1];
    const chapter = Number(match[2]);
    const verse = Number(match[3]);
    const bookId = normalizeBookId(bookPart);
    const book = getBookById(bookId);
    const text = `Stub text for ${referenceText}`;

    return {
      ok: true,
      status: 200,
      json: async () => ({
        reference: referenceText,
        verses: [
          {
            book_id: book.id,
            book_name: book.name,
            chapter,
            verse,
            text,
          },
        ],
        text,
        translation_id: 'web',
        translation_name: 'World English Bible',
        translation_note: 'Public Domain',
      }),
      text: async () => JSON.stringify({ reference: referenceText }),
    };
  };
}

test('handleRandomWebVerse returns OT verse data for scope OT', async () => {
  const stubFetch = createStubFetch();
  const result = await handleRandomWebVerse('OT', { offset: 0, fetchImpl: stubFetch });

  assert.equal(result.status, 200);
  assert.equal(result.body.bookId, 'GEN');
  assert.equal(result.body.chapter, 1);
  assert.equal(result.body.verse, 1);
  assert.match(result.body.text, /Stub text for/);
  assert.equal(result.body.translation.id, 'web');
});

test('handleRandomWebVerse returns NT verse data for scope NT', async () => {
  const stubFetch = createStubFetch();
  const result = await handleRandomWebVerse('NT', { offset: 0, fetchImpl: stubFetch });

  assert.equal(result.status, 200);
  assert.equal(result.body.bookId, 'MAT');
  assert.equal(result.body.chapter, 1);
  assert.equal(result.body.verse, 1);
});

test('handleRandomWebVerse accepts canonical book ids (JHN)', async () => {
  const stubFetch = createStubFetch();
  const result = await handleRandomWebVerse('JHN', { offset: 0, fetchImpl: stubFetch });

  assert.equal(result.status, 200);
  assert.equal(result.body.bookId, 'JHN');
  assert.equal(result.body.chapter, 1);
  assert.equal(result.body.verse, 1);
});

test('handleRandomWebVerse rejects invalid scopes', async () => {
  const result = await handleRandomWebVerse('NOT_A_BOOK', {
    offset: 0,
    fetchImpl: createStubFetch(),
  });
  assert.equal(result.status, 400);
  assert.match(result.body.error, /Invalid scope/);
});
