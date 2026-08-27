import { createClient } from "@/lib/supabase/server";

export type NotificationPayload = {
  userId: string;
  type: string;
  title: string;
  body: string;
  entityType?: string | null;
  entityId?: string | null;
};

export async function sendNotification(payload: NotificationPayload) {
  const supabase = createClient();

  const { error: insertError } = await supabase.from("notifications").insert({
    user_id: payload.userId,
    type: payload.type,
    title: payload.title,
    body: payload.body,
    entity_type: payload.entityType ?? null,
    entity_id: payload.entityId ?? null,
    channel: "push"
  });

  if (insertError) {
    console.error("Notification insert failed:", insertError.message);
    return { ok: false, inserted: false, pushSent: false, error: insertError.message };
  }

  const { data: subscriptions, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, keys")
    .eq("user_id", payload.userId);

  if (subsError) {
    console.error("Failed to load push subscriptions:", subsError.message);
    return { ok: true, inserted: true, pushSent: false };
  }

  if (!subscriptions?.length) {
    return { ok: true, inserted: true, pushSent: false };
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.warn("VAPID keys missing; skipping push notifications.");
    return { ok: true, inserted: true, pushSent: false };
  }

  try {
    const webPush = new Function(
      "return (() => { try { return require('web-push'); } catch (error) { return null; } })()"
    )();

    if (!webPush) {
      console.warn("web-push package not installed yet; notification row created without push delivery.");
      return { ok: true, inserted: true, pushSent: false };
    }

    webPush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:contact@bizzio.online",
      publicKey,
      privateKey
    );

    const payloadBody = JSON.stringify({
      title: payload.title,
      body: payload.body,
      type: payload.type,
      entityType: payload.entityType ?? null,
      entityId: payload.entityId ?? null
    });

    const settled = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const endpoint = (sub as any).endpoint as string;
        const keys = (sub as any).keys as { p256dh?: string; auth?: string };
        if (!endpoint || !keys?.p256dh || !keys?.auth) return;

        await webPush.sendNotification(
          {
            endpoint,
            keys: {
              p256dh: keys.p256dh,
              auth: keys.auth
            }
          },
          payloadBody
        );
      })
    );

    const pushSent = settled.filter((result) => result.status === "fulfilled").length > 0;
    return { ok: true, inserted: true, pushSent };
  } catch (error) {
    console.warn("Web push failed; notification inserted but push was skipped.", error);
    return { ok: true, inserted: true, pushSent: false };
  }
}

export async function notifyEmployeeById(
  employeeId: string,
  payload: Omit<NotificationPayload, "userId">
) {
  const supabase = createClient();
  const { data: employee, error } = await supabase
    .from("employees")
    .select("user_id")
    .eq("id", employeeId)
    .single();

  if (error || !employee?.user_id) {
    return { ok: false, reason: error?.message ?? "No user linked to employee" };
  }

  return sendNotification({ ...payload, userId: employee.user_id });
}
