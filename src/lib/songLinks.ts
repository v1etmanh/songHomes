/** Sóng Homestay's public contact channels, shared by the header, footer and "Chat với Sóng" buttons. */
export const SONG_LINKS = {
  facebook: 'https://web.facebook.com/profile.php?id=61565029046864',
  facebookReviews: 'https://web.facebook.com/profile.php?id=61565029046864&sk=reviews',
  instagram: 'https://www.instagram.com/_songhomestay/',
  phone: '0911.388.703',
  phoneHref: 'tel:0911388703',
  zalo: 'https://zalo.me/0911388703',
  email: 'Songhomestay@gmail.com',
} as const;

/** Zalo chat with a prefilled first line copied for the guest (Zalo has no message parameter). */
export function chatWithSong(message: string) {
  try {
    void navigator.clipboard?.writeText(message);
  } catch {
    // Clipboard is a convenience only.
  }
  window.open(SONG_LINKS.zalo, '_blank', 'noopener');
}
