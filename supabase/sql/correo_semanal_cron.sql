-- Programa (o arregla) el aviso de pg_cron del correo de los domingos sin tener que copiar AVISOS_SECRET a mano:
-- lo toma del trabajo 'avisos-diarios', que ya lo lleva. Ejecutar en el SQL Editor después de correo_semanal.sql.

-- 1. Comprobación: tiene que salir «true». Si sale null, el trabajo avisos-diarios no existe o no tiene el secreto.
select (regexp_match(command, 'x-internal-secret'',\s*''([^'']+)'''))[1] is not null as secreto_encontrado
from cron.job where jobname = 'avisos-diarios';

-- 2. Reprograma correo-semanal con ese mismo secreto (los domingos, cada hora; la función solo envía a las 18:00).
select cron.unschedule('correo-semanal') where exists (select 1 from cron.job where jobname = 'correo-semanal');
select cron.schedule('correo-semanal', '2 * * * 0', format($f$
    select net.http_post(
        url := 'https://avdqtnukgbejorieuunj.supabase.co/functions/v1/correo-semanal',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', %L),
        body := '{}'::jsonb
    );
$f$, (select (regexp_match(command, 'x-internal-secret'',\s*''([^'']+)'''))[1] from cron.job where jobname = 'avisos-diarios')));

-- 3. Prueba: te manda ahora mismo el correo a ti (hay que tenerlo encendido en Ajustes → conexiones).
--    Para ver la respuesta: select status_code, content from net._http_response order by created desc limit 1;
-- select net.http_post(
--     url := 'https://avdqtnukgbejorieuunj.supabase.co/functions/v1/correo-semanal',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret',
--         (select (regexp_match(command, 'x-internal-Csecret'',\s*''([^'']+)'''))[1] from cron.job where jobname = 'avisos-diarios')),
--     body := jsonb_build_object('forzar', true, 'user_id', (select id from auth.users where email = 'jandropas@gmail.com'))
-- );
