export const CONVERSATION_FIELDS = "id,vehicle_id,buyer_id,seller_id,is_blocked,is_reported,created_at,lead_status";
export const MESSAGE_FIELDS = "id,conversation_id,sender_id,body,created_at,read_at,is_automated";

export function isParticipant(conversation, userId) {
  return Boolean(userId && conversation?.id && (conversation.buyer_id === userId || conversation.seller_id === userId));
}

export function conversationTitle(conversation, vehicle) {
  return [conversation?.vehicle_brand || vehicle?.brand, conversation?.vehicle_model || vehicle?.model].filter(Boolean).join(" ") || "Publicación";
}

export function isTransportError(error) {
  return !error?.code || /fetch|network|offline|conexión/i.test(error.message || "");
}
