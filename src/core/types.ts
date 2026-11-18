// Host API level. Bump when the addon API changes incompatibly
// (same role as Kodi's xbmc.python version or CloudStream's apiVersion).
export const HOST_API_VERSION = 1;
export const APP_VERSION = '0.2.40';

export type AddonType = 'provider' | 'extractor';
export type TvType = 'movie' | 'series' | 'anime' | 'live' | 'other';

export interface AddonSetting {
  id: string;
  label: string;
  type: 'text' | 'bool' | 'select';
  default?: string | boolean;
  options?: string[];
  help?: string;
}

export interface AddonManifest {
  id: string;
  name: string;
  version: string;
  apiVersion: number;
  type: AddonType;
  main: string;
  description?: string;
  author?: string;
  icon?: string;
  language?: string;
  tvTypes?: TvType[];
  domains?: string[]; // extractors: hosts they resolve
  permissions?: { hosts?: string[] }; // network allow-list
  settings?: AddonSetting[];
}

export interface InstalledAddon {
  manifest: AddonManifest;
  code: string;
  icon?: string; // data: URL
  enabled: boolean;
  source?: string;
  installedAt: number;
}

export interface MediaItem {
  id: string;
  title: string;
  poster?: string;
  type: TvType;
  year?: number;
}

export interface HomeSection {
  title: string;
  items: MediaItem[];
  more?: string; // opaque token: Fanoos calls getMore(more) to get the next items of this row
  tabs?: { title: string; more: string }[]; // extra tabs after "All": Fanoos loads one with getMore(tab.more)
  first?: string; // label of the first tab (the row's own items) instead of "All"
}

/** What getMore() returns; search() may return this too instead of a plain array. */
export interface MorePage {
  items: MediaItem[];
  more?: string; // next token, absent when there is nothing more
}

export interface Episode {
  id: string;
  title: string;
  season?: number;
  seasonName?: string; // the season's own title on the site, e.g. "Season One" or "الموسم الاول"
  episode?: number;
  poster?: string;
}

export interface MediaDetails extends MediaItem {
  plot?: string;
  backdrop?: string;
  tags?: string[];
  episodes?: Episode[];
}

export interface StreamLink {
  name: string;
  url: string;
  // youtube/dailymotion: url is the video id, played in the official embed. web: an embed page shown as-is.
  kind: 'hls' | 'dash' | 'file' | 'embed' | 'youtube' | 'dailymotion' | 'web';
  quality?: string;
  mime?: string; // e.g. video/webm; lets the player skip formats the device can't decode
  player?: string; // dailymotion: your Dailymotion player ID (required by their current embed)
  headers?: Record<string, string>;
}

export interface Subtitle {
  lang: string;
  url: string;
  label?: string;
}

export interface LinksResult {
  links: StreamLink[];
  subtitles?: Subtitle[];
}
