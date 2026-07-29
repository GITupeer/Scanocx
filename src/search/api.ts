export { getSearchDb } from '@/src/search/db';
export {
  upsertBookInSearchIndex,
  removeBookFromSearchIndex,
  removePageFromSearchIndex,
  scheduleBookSearchIndex,
  scheduleRemoveBookSearchIndex,
} from '@/src/search/index';
export { rebuildSearchIndex } from '@/src/search/rebuild';
export { searchInBooks, type SearchHit } from '@/src/search/query';
export { normalizeForSearch, buildFtsQuery } from '@/src/search/normalize';
