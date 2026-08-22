export function conversationPair(userA: string, userB: string) {
  return userA < userB
    ? { user_a_id: userA, user_b_id: userB }
    : { user_a_id: userB, user_b_id: userA };
}

export function otherUserId(pair: { user_a_id: string; user_b_id: string }, me: string) {
  return pair.user_a_id === me ? pair.user_b_id : pair.user_a_id;
}
