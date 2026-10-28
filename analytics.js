// PostHog — the only analytics on the site (Política de Privacidade, seção 3.5).
// Same project as app.kozy.com.br: the cookie is shared across *.kozy.com.br, so the
// landing's UTM is attributed to the sign-up in the app.
// Empty key = analytics off (same behavior as the app without NEXT_PUBLIC_POSTHOG_KEY).
const POSTHOG_KEY = '';

if (POSTHOG_KEY) {
    // Official loader snippet (https://posthog.com/docs/libraries/js).
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled getFeatureFlag onFeatureFlags identify alias people.set people.set_once set_config".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

    window.posthog.init(POSTHOG_KEY, {
        api_host: 'https://us.i.posthog.com',
        person_profiles: 'identified_only',
        cross_subdomain_cookie: true,
        disable_session_recording: true,
    });
}
