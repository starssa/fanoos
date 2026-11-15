// Watch progress ("Continue watching") and favorites.
import { db } from './storage';
import type { MediaItem } from './types';

export interface HistoryEntry {
  key: string;
  addonId: string;
  item: MediaItem;
  episodeId?: string;
  episodeTitle?: string;
  position: number;
  duration: number;
  updatedAt: number;
}
export interface FavoriteEntry {
  key: string;
  addonId: string;
  item: MediaItem;
  addedAt: number;
}

const key = (addonId: string, itemId: string) => addonId + '|' + itemId;

export const library = {
  async saveProgress(e: Omit<HistoryEntry, 'key' | 'updatedAt'>) {
    if (!(e.duration > 0) || !isFinite(e.duration) || e.position < 10) return; // live streams / barely started
    const k = key(e.addonId, e.item.id);
    if (e.position / e.duration > 0.94) return db.del('history', k); // finished
    await db.put('history', k, { ...e, key: k, updatedAt: Date.now() });
  },
  removeProgress(addonId: string, itemId: string) {
    return db.del('history', key(addonId, itemId));
  },
  clearProgress() {
    return db.clear('history');
  },
  getProgress(addonId: string, itemId: string) {
    return db.get<HistoryEntry>('history', key(addonId, itemId));
  },
  async continueWatching(): Promise<HistoryEntry[]> {
    return (await db.all<HistoryEntry>('history')).sort((a, b) => b.updatedAt - a.updatedAt);
  },
  async isFavorite(addonId: string, itemId: string) {
    return !!(await db.get('favorites', key(addonId, itemId)));
  },
  async toggleFavorite(addonId: string, item: MediaItem): Promise<boolean> {
    const k = key(addonId, item.id);
    if (await db.get('favorites', k)) { await db.del('favorites', k); return false; }
    await db.put('favorites', k, { key: k, addonId, item, addedAt: Date.now() });
    return true;
  },
  async listFavorites(): Promise<FavoriteEntry[]> {
    return (await db.all<FavoriteEntry>('favorites')).sort((a, b) => b.addedAt - a.addedAt);
  },
};
