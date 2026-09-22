--
-- PostgreSQL database dump
--

\restrict Y81bcnE1iZV1KLy1oRY5Bsb94ZJmNVS4DKNhtuUGwdSFKcS1uKwKYNvpYoBfuqb

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.usuarios_roles DROP CONSTRAINT IF EXISTS fk_usuarios_roles_usuario;
ALTER TABLE IF EXISTS ONLY public.usuarios_roles DROP CONSTRAINT IF EXISTS fk_usuarios_roles_rol;
ALTER TABLE IF EXISTS ONLY public.tokens_cuenta DROP CONSTRAINT IF EXISTS fk_tokens_usuario;
ALTER TABLE IF EXISTS ONLY public.sesiones DROP CONSTRAINT IF EXISTS fk_sesiones_usuario;
ALTER TABLE IF EXISTS ONLY public.auditoria_cuentas DROP CONSTRAINT IF EXISTS fk_auditoria_cuenta;
ALTER TABLE IF EXISTS ONLY public.auditoria_cuentas DROP CONSTRAINT IF EXISTS fk_auditoria_autor;
DROP TRIGGER IF EXISTS tr_auditoria_cuentas_solo_insercion ON public.auditoria_cuentas;
DROP INDEX IF EXISTS public.idx_usuarios_roles_rol;
DROP INDEX IF EXISTS public.idx_usuarios_email;
DROP INDEX IF EXISTS public.idx_tokens_usuario;
DROP INDEX IF EXISTS public.idx_tokens_hash;
DROP INDEX IF EXISTS public.idx_sesiones_usuario;
DROP INDEX IF EXISTS public.idx_sesiones_jti;
DROP INDEX IF EXISTS public.idx_auditoria_cuenta;
ALTER TABLE IF EXISTS ONLY public.usuarios_roles DROP CONSTRAINT IF EXISTS usuarios_roles_pkey;
ALTER TABLE IF EXISTS ONLY public.usuarios DROP CONSTRAINT IF EXISTS usuarios_pkey;
ALTER TABLE IF EXISTS ONLY public.roles DROP CONSTRAINT IF EXISTS uq_roles_nombre;
ALTER TABLE IF EXISTS ONLY public.tokens_cuenta DROP CONSTRAINT IF EXISTS tokens_cuenta_pkey;
ALTER TABLE IF EXISTS ONLY public.sesiones DROP CONSTRAINT IF EXISTS sesiones_pkey;
ALTER TABLE IF EXISTS ONLY public.roles DROP CONSTRAINT IF EXISTS roles_pkey;
ALTER TABLE IF EXISTS ONLY public.auditoria_cuentas DROP CONSTRAINT IF EXISTS auditoria_cuentas_pkey;
ALTER TABLE IF EXISTS ONLY public.migraciones DROP CONSTRAINT IF EXISTS "PK_c790b3af92e49234538c56f4abb";
ALTER TABLE IF EXISTS public.migraciones ALTER COLUMN id DROP DEFAULT;
DROP TABLE IF EXISTS public.usuarios_roles;
DROP TABLE IF EXISTS public.usuarios;
DROP TABLE IF EXISTS public.tokens_cuenta;
DROP TABLE IF EXISTS public.sesiones;
DROP TABLE IF EXISTS public.roles;
DROP SEQUENCE IF EXISTS public.migraciones_id_seq;
DROP TABLE IF EXISTS public.migraciones;
DROP TABLE IF EXISTS public.auditoria_cuentas;
DROP FUNCTION IF EXISTS public.auditoria_cuentas_solo_insercion();
DROP TYPE IF EXISTS public.tipo_token;
DROP TYPE IF EXISTS public.estado_cuenta;
DROP EXTENSION IF EXISTS "uuid-ossp";
--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: estado_cuenta; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.estado_cuenta AS ENUM (
    'PENDIENTE_VERIFICACION',
    'ACTIVA',
    'DESACTIVADA'
);


--
-- Name: tipo_token; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tipo_token AS ENUM (
    'VERIFICACION',
    'RECUPERACION'
);


--
-- Name: auditoria_cuentas_solo_insercion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auditoria_cuentas_solo_insercion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        RAISE EXCEPTION 'auditoria_cuentas es de solo inserción (% no permitido)', TG_OP
          USING ERRCODE = 'restrict_violation';
      END;
      $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: auditoria_cuentas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auditoria_cuentas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cuenta_id uuid NOT NULL,
    accion character varying(20) NOT NULL,
    estado_anterior public.estado_cuenta NOT NULL,
    estado_nuevo public.estado_cuenta NOT NULL,
    realizada_por uuid NOT NULL,
    motivo character varying(300),
    sesiones_cerradas integer DEFAULT 0 NOT NULL,
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_auditoria_accion CHECK (((accion)::text = ANY ((ARRAY['ACTIVAR'::character varying, 'REACTIVAR'::character varying, 'DESACTIVAR'::character varying, 'ELIMINAR'::character varying])::text[]))),
    CONSTRAINT ck_auditoria_sesiones CHECK ((sesiones_cerradas >= 0))
);


--
-- Name: migraciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migraciones (
    id integer NOT NULL,
    "timestamp" bigint NOT NULL,
    name character varying NOT NULL
);


--
-- Name: migraciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.migraciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: migraciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.migraciones_id_seq OWNED BY public.migraciones.id;


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre character varying(40) NOT NULL,
    descripcion character varying(200) NOT NULL,
    del_sistema boolean DEFAULT false NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sesiones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sesiones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid NOT NULL,
    jti uuid NOT NULL,
    emitida_en timestamp with time zone DEFAULT now() NOT NULL,
    expira_en timestamp with time zone NOT NULL,
    revocada_en timestamp with time zone,
    direccion_ip character varying(45),
    agente_usuario character varying(255),
    creada_en timestamp with time zone DEFAULT now() NOT NULL,
    generacion_renovacion integer DEFAULT 0 NOT NULL,
    renovacion_expira_en timestamp with time zone,
    renovada_en timestamp with time zone,
    motivo_revocacion character varying(20),
    CONSTRAINT ck_sesiones_expira_despues CHECK ((expira_en > emitida_en)),
    CONSTRAINT ck_sesiones_generacion CHECK ((generacion_renovacion >= 0)),
    CONSTRAINT ck_sesiones_motivo_revocacion CHECK (((motivo_revocacion IS NULL) OR ((motivo_revocacion)::text = 'REUTILIZACION'::text)))
);


--
-- Name: tokens_cuenta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tokens_cuenta (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid NOT NULL,
    tipo public.tipo_token NOT NULL,
    hash_token character varying(64) NOT NULL,
    expira_en timestamp with time zone NOT NULL,
    usado_en timestamp with time zone,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_tokens_expira_despues CHECK ((expira_en > creado_en)),
    CONSTRAINT ck_tokens_hash_es_sha256 CHECK (((hash_token)::text ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre character varying(160) NOT NULL,
    email character varying(254) NOT NULL,
    hash_contrasena character varying(255) NOT NULL,
    estado public.estado_cuenta DEFAULT 'PENDIENTE_VERIFICACION'::public.estado_cuenta NOT NULL,
    verificado_en timestamp with time zone,
    intentos_fallidos integer DEFAULT 0 NOT NULL,
    bloqueada_hasta timestamp with time zone,
    ultimo_acceso_en timestamp with time zone,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    eliminada_en timestamp with time zone,
    CONSTRAINT ck_usuarios_eliminada_desactivada CHECK (((eliminada_en IS NULL) OR (estado = 'DESACTIVADA'::public.estado_cuenta))),
    CONSTRAINT ck_usuarios_email_forma CHECK (((email)::text ~~ '%_@_%.__%'::text)),
    CONSTRAINT ck_usuarios_email_minusculas CHECK (((email)::text = lower((email)::text))),
    CONSTRAINT ck_usuarios_intentos_no_negativos CHECK ((intentos_fallidos >= 0)),
    CONSTRAINT ck_usuarios_verificacion_coherente CHECK ((((estado = 'PENDIENTE_VERIFICACION'::public.estado_cuenta) AND (verificado_en IS NULL)) OR ((estado <> 'PENDIENTE_VERIFICACION'::public.estado_cuenta) AND (verificado_en IS NOT NULL))))
);


--
-- Name: usuarios_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios_roles (
    usuario_id uuid NOT NULL,
    rol_id uuid NOT NULL,
    asignado_por uuid,
    asignado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: migraciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migraciones ALTER COLUMN id SET DEFAULT nextval('public.migraciones_id_seq'::regclass);


--
-- Data for Name: auditoria_cuentas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.auditoria_cuentas (id, cuenta_id, accion, estado_anterior, estado_nuevo, realizada_por, motivo, sesiones_cerradas, fecha) FROM stdin;
\.


--
-- Data for Name: migraciones; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.migraciones (id, "timestamp", name) FROM stdin;
2	1789430400000	EsquemaInicialCu0271789430400000
3	1789516800000	AdministracionCuentasCu027b1789516800000
5	1789603200000	RenovacionSesiones1789603200000
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.roles (id, nombre, descripcion, del_sistema, creado_en) FROM stdin;
f189e834-dadf-4533-9e8c-07b018756077	Cliente	Compra entradas, parqueadero y pedidos. Rol por defecto al registrarse.	t	2026-09-16 03:39:53.29051+00
c591369a-b8bb-46f9-8d46-f9c26d4ce48a	Personal	Personal operativo del evento: ingreso, parqueadero, restaurante.	t	2026-09-16 03:39:53.29051+00
3aa8ea5e-250a-49c5-8758-6f113ad50e6b	Organizador	Crea y gestiona eventos, zonas y aforo.	t	2026-09-16 03:39:53.29051+00
499578e1-dbd6-4081-8975-1257b1f79935	Administrador	Administra cuentas, roles, proveedores y reportes.	t	2026-09-16 03:39:53.29051+00
\.


--
-- Data for Name: sesiones; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sesiones (id, usuario_id, jti, emitida_en, expira_en, revocada_en, direccion_ip, agente_usuario, creada_en, generacion_renovacion, renovacion_expira_en, renovada_en, motivo_revocacion) FROM stdin;
15c29571-d99e-4ca6-a683-0218cd27ccf3	a0000005-0000-4000-8000-000000000005	157b43e9-95a1-4fbe-8fde-3491a5e1f821	2026-09-21 02:55:13.71+00	2026-09-21 03:10:13.71+00	\N	::ffff:172.20.0.10	node	2026-09-21 02:55:13.713361+00	0	2026-10-21 02:55:13.71+00	\N	\N
\.


--
-- Data for Name: tokens_cuenta; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tokens_cuenta (id, usuario_id, tipo, hash_token, expira_en, usado_en, creado_en) FROM stdin;
\.


--
-- Data for Name: usuarios; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.usuarios (id, nombre, email, hash_contrasena, estado, verificado_en, intentos_fallidos, bloqueada_hasta, ultimo_acceso_en, creado_en, actualizado_en, eliminada_en) FROM stdin;
a0000001-0000-4000-8000-000000000001	Ana Gómez	cliente@hexacore.com	scrypt$32768$8$1$YOUm9YjTcCCOfsRVzbA57g==$rHJTNuwXYm67LViB988qzzGBUQJLky2ud0Uqzw7UuAQCPM3q37/ra7JcB+ExztnVg1464pepgEMvC3GEi3DZNA==	ACTIVA	2026-09-21 02:55:12.314+00	0	\N	\N	2026-09-21 02:55:12.286624+00	2026-09-21 02:55:12.286624+00	\N
a0000002-0000-4000-8000-000000000002	Bruno Díaz	bruno@hexacore.com	scrypt$32768$8$1$YOUm9YjTcCCOfsRVzbA57g==$rHJTNuwXYm67LViB988qzzGBUQJLky2ud0Uqzw7UuAQCPM3q37/ra7JcB+ExztnVg1464pepgEMvC3GEi3DZNA==	ACTIVA	2026-09-21 02:55:12.318+00	0	\N	\N	2026-09-21 02:55:12.286624+00	2026-09-21 02:55:12.286624+00	\N
a0000003-0000-4000-8000-000000000003	Carla Ruiz	carla@hexacore.com	scrypt$32768$8$1$YOUm9YjTcCCOfsRVzbA57g==$rHJTNuwXYm67LViB988qzzGBUQJLky2ud0Uqzw7UuAQCPM3q37/ra7JcB+ExztnVg1464pepgEMvC3GEi3DZNA==	ACTIVA	2026-09-21 02:55:12.319+00	0	\N	\N	2026-09-21 02:55:12.286624+00	2026-09-21 02:55:12.286624+00	\N
a0000004-0000-4000-8000-000000000004	Luis Ramírez	personal@hexacore.com	scrypt$32768$8$1$YOUm9YjTcCCOfsRVzbA57g==$rHJTNuwXYm67LViB988qzzGBUQJLky2ud0Uqzw7UuAQCPM3q37/ra7JcB+ExztnVg1464pepgEMvC3GEi3DZNA==	ACTIVA	2026-09-21 02:55:12.32+00	0	\N	\N	2026-09-21 02:55:12.286624+00	2026-09-21 02:55:12.286624+00	\N
a0000008-0000-4000-8000-000000000008	Marta Gómez	parqueadero@hexacore.com	scrypt$32768$8$1$YOUm9YjTcCCOfsRVzbA57g==$rHJTNuwXYm67LViB988qzzGBUQJLky2ud0Uqzw7UuAQCPM3q37/ra7JcB+ExztnVg1464pepgEMvC3GEi3DZNA==	ACTIVA	2026-09-21 02:55:12.322+00	0	\N	\N	2026-09-21 02:55:12.286624+00	2026-09-21 02:55:12.286624+00	\N
a0000009-0000-4000-8000-000000000009	Carlos Peña	restaurante@hexacore.com	scrypt$32768$8$1$YOUm9YjTcCCOfsRVzbA57g==$rHJTNuwXYm67LViB988qzzGBUQJLky2ud0Uqzw7UuAQCPM3q37/ra7JcB+ExztnVg1464pepgEMvC3GEi3DZNA==	ACTIVA	2026-09-21 02:55:12.322+00	0	\N	\N	2026-09-21 02:55:12.286624+00	2026-09-21 02:55:12.286624+00	\N
a0000010-0000-4000-8000-000000000010	Jorge Rincón	jefepersonal@hexacore.com	scrypt$32768$8$1$YOUm9YjTcCCOfsRVzbA57g==$rHJTNuwXYm67LViB988qzzGBUQJLky2ud0Uqzw7UuAQCPM3q37/ra7JcB+ExztnVg1464pepgEMvC3GEi3DZNA==	ACTIVA	2026-09-21 02:55:12.323+00	0	\N	\N	2026-09-21 02:55:12.286624+00	2026-09-21 02:55:12.286624+00	\N
a0000011-0000-4000-8000-000000000011	Sofía Vargas	reemplazo@hexacore.com	scrypt$32768$8$1$YOUm9YjTcCCOfsRVzbA57g==$rHJTNuwXYm67LViB988qzzGBUQJLky2ud0Uqzw7UuAQCPM3q37/ra7JcB+ExztnVg1464pepgEMvC3GEi3DZNA==	ACTIVA	2026-09-21 02:55:12.324+00	0	\N	\N	2026-09-21 02:55:12.286624+00	2026-09-21 02:55:12.286624+00	\N
a0000006-0000-4000-8000-000000000006	Pedro Sin Verificar	pendiente@hexacore.com	scrypt$32768$8$1$YOUm9YjTcCCOfsRVzbA57g==$rHJTNuwXYm67LViB988qzzGBUQJLky2ud0Uqzw7UuAQCPM3q37/ra7JcB+ExztnVg1464pepgEMvC3GEi3DZNA==	PENDIENTE_VERIFICACION	\N	0	\N	\N	2026-09-21 02:55:12.286624+00	2026-09-21 02:55:12.286624+00	\N
a0000007-0000-4000-8000-000000000007	Marta Desactivada	desactivada@hexacore.com	scrypt$32768$8$1$YOUm9YjTcCCOfsRVzbA57g==$rHJTNuwXYm67LViB988qzzGBUQJLky2ud0Uqzw7UuAQCPM3q37/ra7JcB+ExztnVg1464pepgEMvC3GEi3DZNA==	DESACTIVADA	2026-09-21 02:55:12.325+00	0	\N	\N	2026-09-21 02:55:12.286624+00	2026-09-21 02:55:12.286624+00	\N
a0000005-0000-4000-8000-000000000005	Isabel Rojas	admin@hexacore.com	scrypt$32768$8$1$YOUm9YjTcCCOfsRVzbA57g==$rHJTNuwXYm67LViB988qzzGBUQJLky2ud0Uqzw7UuAQCPM3q37/ra7JcB+ExztnVg1464pepgEMvC3GEi3DZNA==	ACTIVA	2026-09-21 02:55:12.32+00	0	\N	2026-09-21 02:55:13.713361+00	2026-09-21 02:55:12.286624+00	2026-09-21 02:55:13.713361+00	\N
\.


--
-- Data for Name: usuarios_roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.usuarios_roles (usuario_id, rol_id, asignado_por, asignado_en) FROM stdin;
a0000001-0000-4000-8000-000000000001	f189e834-dadf-4533-9e8c-07b018756077	\N	2026-09-21 02:55:12.286624+00
a0000002-0000-4000-8000-000000000002	f189e834-dadf-4533-9e8c-07b018756077	\N	2026-09-21 02:55:12.286624+00
a0000003-0000-4000-8000-000000000003	f189e834-dadf-4533-9e8c-07b018756077	\N	2026-09-21 02:55:12.286624+00
a0000004-0000-4000-8000-000000000004	c591369a-b8bb-46f9-8d46-f9c26d4ce48a	\N	2026-09-21 02:55:12.286624+00
a0000005-0000-4000-8000-000000000005	499578e1-dbd6-4081-8975-1257b1f79935	\N	2026-09-21 02:55:12.286624+00
a0000005-0000-4000-8000-000000000005	c591369a-b8bb-46f9-8d46-f9c26d4ce48a	\N	2026-09-21 02:55:12.286624+00
a0000008-0000-4000-8000-000000000008	c591369a-b8bb-46f9-8d46-f9c26d4ce48a	\N	2026-09-21 02:55:12.286624+00
a0000009-0000-4000-8000-000000000009	c591369a-b8bb-46f9-8d46-f9c26d4ce48a	\N	2026-09-21 02:55:12.286624+00
a0000010-0000-4000-8000-000000000010	c591369a-b8bb-46f9-8d46-f9c26d4ce48a	\N	2026-09-21 02:55:12.286624+00
a0000011-0000-4000-8000-000000000011	c591369a-b8bb-46f9-8d46-f9c26d4ce48a	\N	2026-09-21 02:55:12.286624+00
a0000006-0000-4000-8000-000000000006	f189e834-dadf-4533-9e8c-07b018756077	\N	2026-09-21 02:55:12.286624+00
a0000007-0000-4000-8000-000000000007	f189e834-dadf-4533-9e8c-07b018756077	\N	2026-09-21 02:55:12.286624+00
\.


--
-- Name: migraciones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.migraciones_id_seq', 5, true);


--
-- Name: migraciones PK_c790b3af92e49234538c56f4abb; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migraciones
    ADD CONSTRAINT "PK_c790b3af92e49234538c56f4abb" PRIMARY KEY (id);


--
-- Name: auditoria_cuentas auditoria_cuentas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_cuentas
    ADD CONSTRAINT auditoria_cuentas_pkey PRIMARY KEY (id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: sesiones sesiones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sesiones
    ADD CONSTRAINT sesiones_pkey PRIMARY KEY (id);


--
-- Name: tokens_cuenta tokens_cuenta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tokens_cuenta
    ADD CONSTRAINT tokens_cuenta_pkey PRIMARY KEY (id);


--
-- Name: roles uq_roles_nombre; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT uq_roles_nombre UNIQUE (nombre);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: usuarios_roles usuarios_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles
    ADD CONSTRAINT usuarios_roles_pkey PRIMARY KEY (usuario_id, rol_id);


--
-- Name: idx_auditoria_cuenta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditoria_cuenta ON public.auditoria_cuentas USING btree (cuenta_id, fecha DESC);


--
-- Name: idx_sesiones_jti; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_sesiones_jti ON public.sesiones USING btree (jti);


--
-- Name: idx_sesiones_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sesiones_usuario ON public.sesiones USING btree (usuario_id);


--
-- Name: idx_tokens_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_tokens_hash ON public.tokens_cuenta USING btree (hash_token);


--
-- Name: idx_tokens_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tokens_usuario ON public.tokens_cuenta USING btree (usuario_id, tipo);


--
-- Name: idx_usuarios_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_usuarios_email ON public.usuarios USING btree (email);


--
-- Name: idx_usuarios_roles_rol; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuarios_roles_rol ON public.usuarios_roles USING btree (rol_id);


--
-- Name: auditoria_cuentas tr_auditoria_cuentas_solo_insercion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_auditoria_cuentas_solo_insercion BEFORE DELETE OR UPDATE ON public.auditoria_cuentas FOR EACH ROW EXECUTE FUNCTION public.auditoria_cuentas_solo_insercion();


--
-- Name: auditoria_cuentas fk_auditoria_autor; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_cuentas
    ADD CONSTRAINT fk_auditoria_autor FOREIGN KEY (realizada_por) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: auditoria_cuentas fk_auditoria_cuenta; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_cuentas
    ADD CONSTRAINT fk_auditoria_cuenta FOREIGN KEY (cuenta_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: sesiones fk_sesiones_usuario; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sesiones
    ADD CONSTRAINT fk_sesiones_usuario FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: tokens_cuenta fk_tokens_usuario; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tokens_cuenta
    ADD CONSTRAINT fk_tokens_usuario FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: usuarios_roles fk_usuarios_roles_rol; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles
    ADD CONSTRAINT fk_usuarios_roles_rol FOREIGN KEY (rol_id) REFERENCES public.roles(id) ON DELETE RESTRICT;


--
-- Name: usuarios_roles fk_usuarios_roles_usuario; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles
    ADD CONSTRAINT fk_usuarios_roles_usuario FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict Y81bcnE1iZV1KLy1oRY5Bsb94ZJmNVS4DKNhtuUGwdSFKcS1uKwKYNvpYoBfuqb

