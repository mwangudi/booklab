// The login screen carousel. Slides are managed in Administration -> Login
// screen; the pictures themselves are served from the API by id.

export interface PromoSlide {
  id: number;
  title: string | null;
  subtitle: string | null;
  sortOrder: number;
  active?: boolean;
  /** updatedAt in ms — appended to the image URL so a replaced picture is picked up. */
  v: number;
}

/** Shown when no slides have been set up yet, or the server can't be reached. */
export const FALLBACK_SLIDE: PromoSlide = {
  id: 0,
  title: 'For Quality, For You',
  subtitle:
    'Books, textbooks, exercise & story books, stationery and lab equipment — across our Luanda, Kapsabet and Mumias branches.',
  sortOrder: 0,
  v: 0,
};

export function slideImageUrl(slide: PromoSlide): string {
  return slide.id === 0 ? '/promo/madaraka-day.jpeg' : `/api/promo/${slide.id}/image?v=${slide.v}`;
}
