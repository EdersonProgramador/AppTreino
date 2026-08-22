export function defaultUserImage() {
  return `${process.env.SERVER_URL}/images/user/profile-user.png`;
}

export function withUserImage(imageUrl?: string | null) {
  return imageUrl || defaultUserImage();
}
