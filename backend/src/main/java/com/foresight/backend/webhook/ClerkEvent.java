package com.foresight.backend.webhook;

/**
 * Flattened projection of a Clerk webhook event, carrying only the fields {@link
 * com.foresight.backend.user.UserService} needs to upsert or delete a local row.
 *
 * @param type Clerk event type (e.g. {@code user.created}, {@code user.updated},
 *     {@code user.deleted}).
 * @param clerkUserId Clerk's stable user identifier from the event payload.
 * @param name optional display name composed from {@code first_name} / {@code last_name}.
 */
public record ClerkEvent(String type, String clerkUserId, String name) {}
