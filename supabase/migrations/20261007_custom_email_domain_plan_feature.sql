-- Custom Resend domains are a Pro and ProMax feature.
update subscription_plans
set feature_bundle = feature_bundle || '{"custom_email_domain": true}'::jsonb
where lower(name) in ('pro', 'promax');

update subscription_plans
set feature_bundle = feature_bundle || '{"custom_email_domain": false}'::jsonb
where lower(name) in ('basic', 'advanced');
