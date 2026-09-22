--
-- PostgreSQL database dump
--

\restrict fO2bZwKxNCo6HX5B7RxGCvLNofdF1aW0fBiGmMWrmriBUIEDNz9bWp8gxC0wTUh

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

ALTER TABLE IF EXISTS ONLY public.transacciones_pedido DROP CONSTRAINT IF EXISTS fk_transacciones_pedido;
ALTER TABLE IF EXISTS ONLY public.reservas_inventario DROP CONSTRAINT IF EXISTS fk_reservas_inventario_pedido;
ALTER TABLE IF EXISTS ONLY public.productos DROP CONSTRAINT IF EXISTS fk_productos_establecimiento;
ALTER TABLE IF EXISTS ONLY public.pedidos DROP CONSTRAINT IF EXISTS fk_pedidos_establecimiento;
ALTER TABLE IF EXISTS ONLY public.establecimientos DROP CONSTRAINT IF EXISTS fk_establecimientos_evento;
ALTER TABLE IF EXISTS ONLY public.detalles_pedido DROP CONSTRAINT IF EXISTS fk_detalles_producto;
ALTER TABLE IF EXISTS ONLY public.detalles_pedido DROP CONSTRAINT IF EXISTS fk_detalles_pedido;
DROP INDEX IF EXISTS public.uq_detalles_pedido_producto;
DROP INDEX IF EXISTS public.idx_transacciones_pedido_pedido;
DROP INDEX IF EXISTS public.idx_productos_establecimiento;
DROP INDEX IF EXISTS public.idx_pedidos_establecimiento_estado;
DROP INDEX IF EXISTS public.idx_pedidos_cliente;
DROP INDEX IF EXISTS public.idx_establecimientos_evento;
DROP INDEX IF EXISTS public.idx_detalles_producto;
ALTER TABLE IF EXISTS ONLY public.pedidos DROP CONSTRAINT IF EXISTS uq_pedidos_codigo_qr;
ALTER TABLE IF EXISTS ONLY public.transacciones_pedido DROP CONSTRAINT IF EXISTS transacciones_pedido_pkey;
ALTER TABLE IF EXISTS ONLY public.reservas_inventario DROP CONSTRAINT IF EXISTS reservas_inventario_pkey;
ALTER TABLE IF EXISTS ONLY public.productos DROP CONSTRAINT IF EXISTS productos_pkey;
ALTER TABLE IF EXISTS ONLY public.pedidos DROP CONSTRAINT IF EXISTS pedidos_pkey;
ALTER TABLE IF EXISTS ONLY public.eventos_referencia DROP CONSTRAINT IF EXISTS eventos_referencia_pkey;
ALTER TABLE IF EXISTS ONLY public.establecimientos DROP CONSTRAINT IF EXISTS establecimientos_pkey;
ALTER TABLE IF EXISTS ONLY public.detalles_pedido DROP CONSTRAINT IF EXISTS detalles_pedido_pkey;
ALTER TABLE IF EXISTS ONLY public.migraciones DROP CONSTRAINT IF EXISTS "PK_c790b3af92e49234538c56f4abb";
ALTER TABLE IF EXISTS public.migraciones ALTER COLUMN id DROP DEFAULT;
DROP TABLE IF EXISTS public.transacciones_pedido;
DROP TABLE IF EXISTS public.reservas_inventario;
DROP TABLE IF EXISTS public.productos;
DROP TABLE IF EXISTS public.pedidos;
DROP SEQUENCE IF EXISTS public.migraciones_id_seq;
DROP TABLE IF EXISTS public.migraciones;
DROP TABLE IF EXISTS public.eventos_referencia;
DROP TABLE IF EXISTS public.establecimientos;
DROP TABLE IF EXISTS public.detalles_pedido;
DROP TYPE IF EXISTS public.transaccion_pedido_estado;
DROP TYPE IF EXISTS public.reserva_inventario_estado;
DROP TYPE IF EXISTS public.pedido_estado;
DROP TYPE IF EXISTS public.establecimiento_estado;
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
-- Name: establecimiento_estado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.establecimiento_estado AS ENUM (
    'DISPONIBLE',
    'CERRADO',
    'SATURADO',
    'DESHABILITADO'
);


--
-- Name: pedido_estado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pedido_estado AS ENUM (
    'PENDIENTE_PAGO',
    'CONFIRMADO',
    'EXPIRADO',
    'CANCELADO'
);


--
-- Name: reserva_inventario_estado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reserva_inventario_estado AS ENUM (
    'PREPARANDO',
    'ACTIVA',
    'LIBERACION_PENDIENTE',
    'LIBERADA',
    'CONSUMO_PENDIENTE',
    'CONSUMIDA'
);


--
-- Name: transaccion_pedido_estado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transaccion_pedido_estado AS ENUM (
    'PENDIENTE',
    'APROBADA',
    'RECHAZADA',
    'FALLIDA'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: detalles_pedido; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.detalles_pedido (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pedido_id uuid NOT NULL,
    producto_id uuid NOT NULL,
    nombre_producto character varying(200) NOT NULL,
    precio_unitario numeric(12,2) NOT NULL,
    cantidad integer NOT NULL,
    CONSTRAINT ck_detalles_cantidad_positiva CHECK ((cantidad > 0)),
    CONSTRAINT ck_detalles_precio_positivo CHECK (((precio_unitario > (0)::numeric) AND (precio_unitario <> 'NaN'::numeric)))
);


--
-- Name: establecimientos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.establecimientos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    evento_id uuid NOT NULL,
    nombre character varying(200) NOT NULL,
    estado public.establecimiento_estado DEFAULT 'DESHABILITADO'::public.establecimiento_estado NOT NULL,
    punto_entrega character varying(200) NOT NULL
);


--
-- Name: eventos_referencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eventos_referencia (
    evento_id uuid NOT NULL,
    nombre character varying(200) NOT NULL,
    disponible boolean DEFAULT false NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
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
-- Name: pedidos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedidos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    establecimiento_id uuid NOT NULL,
    estado public.pedido_estado DEFAULT 'PENDIENTE_PAGO'::public.pedido_estado NOT NULL,
    total numeric(12,2) NOT NULL,
    moneda character varying(3) NOT NULL,
    metodo_entrega character varying(80) NOT NULL,
    expira_en timestamp with time zone NOT NULL,
    codigo_qr character varying(64),
    motivo_cancelacion text,
    confirmado_en timestamp with time zone,
    cancelado_en timestamp with time zone,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_pedidos_expiracion_posterior CHECK ((expira_en > creado_en)),
    CONSTRAINT ck_pedidos_moneda_formato CHECK (((moneda)::text ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT ck_pedidos_total_positivo CHECK (((total > (0)::numeric) AND (total <> 'NaN'::numeric)))
);


--
-- Name: productos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.productos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    establecimiento_id uuid NOT NULL,
    nombre character varying(200) NOT NULL,
    descripcion text,
    precio numeric(12,2) NOT NULL,
    activo boolean DEFAULT false NOT NULL,
    cantidad_inventario integer DEFAULT 0 NOT NULL,
    CONSTRAINT ck_productos_inventario_no_negativo CHECK ((cantidad_inventario >= 0)),
    CONSTRAINT ck_productos_precio_positivo CHECK (((precio > (0)::numeric) AND (precio <> 'NaN'::numeric)))
);


--
-- Name: reservas_inventario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservas_inventario (
    pedido_id uuid NOT NULL,
    estado public.reserva_inventario_estado DEFAULT 'PREPARANDO'::public.reserva_inventario_estado NOT NULL,
    creada_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizada_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transacciones_pedido; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transacciones_pedido (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pedido_id uuid NOT NULL,
    monto numeric(12,2) NOT NULL,
    moneda character varying(3) NOT NULL,
    estado public.transaccion_pedido_estado DEFAULT 'PENDIENTE'::public.transaccion_pedido_estado NOT NULL,
    referencia_pasarela character varying(128),
    motivo text,
    creada_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizada_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_transacciones_pedido_moneda_formato CHECK (((moneda)::text ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT ck_transacciones_pedido_monto_positivo CHECK (((monto > (0)::numeric) AND (monto <> 'NaN'::numeric)))
);


--
-- Name: migraciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migraciones ALTER COLUMN id SET DEFAULT nextval('public.migraciones_id_seq'::regclass);


--
-- Data for Name: detalles_pedido; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.detalles_pedido (id, pedido_id, producto_id, nombre_producto, precio_unitario, cantidad) FROM stdin;
\.


--
-- Data for Name: establecimientos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.establecimientos (id, evento_id, nombre, estado, punto_entrega) FROM stdin;
30000000-0000-4000-8000-000000000001	e0000001-0000-4000-8000-000000000001	Food Truck La Sazón	DISPONIBLE	Zona gastronómica - Módulo 4
30000000-0000-4000-8000-000000000002	e0000001-0000-4000-8000-000000000001	Taquería El Comal	DISPONIBLE	Zona gastronómica - Módulo 5
30000000-0000-4000-8000-000000000003	e0000001-0000-4000-8000-000000000001	Pizzería Masa y Fuego	DISPONIBLE	Plazoleta central - Módulo 2
\.


--
-- Data for Name: eventos_referencia; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.eventos_referencia (evento_id, nombre, disponible, actualizado_en) FROM stdin;
e0000001-0000-4000-8000-000000000001	HEXACORE Fest 2026	t	2026-09-22 05:13:01.981912+00
\.


--
-- Data for Name: migraciones; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.migraciones (id, "timestamp", name) FROM stdin;
1	1789902006180	EsquemaInicialCu0111789902006180
2	1790000000000	ReservasInventarioCu0111790000000000
\.


--
-- Data for Name: pedidos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pedidos (id, cliente_id, establecimiento_id, estado, total, moneda, metodo_entrega, expira_en, codigo_qr, motivo_cancelacion, confirmado_en, cancelado_en, creado_en, actualizado_en) FROM stdin;
\.


--
-- Data for Name: productos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.productos (id, establecimiento_id, nombre, descripcion, precio, activo, cantidad_inventario) FROM stdin;
40000000-0000-4000-8000-000000000001	30000000-0000-4000-8000-000000000001	Hamburguesa	\N	25000.00	t	20
40000000-0000-4000-8000-000000000002	30000000-0000-4000-8000-000000000001	Gaseosa	\N	6000.00	t	30
40000000-0000-4000-8000-000000000003	30000000-0000-4000-8000-000000000001	Papas fritas	\N	12000.00	t	1
40000000-0000-4000-8000-000000000004	30000000-0000-4000-8000-000000000001	Jugo natural	\N	7000.00	t	0
40000000-0000-4000-8000-000000000005	30000000-0000-4000-8000-000000000002	Tacos al pastor	Tres tacos con piña y cilantro.	22000.00	t	18
40000000-0000-4000-8000-000000000006	30000000-0000-4000-8000-000000000002	Quesadilla de queso	Tortilla a la plancha con queso fundido.	16000.00	t	8
40000000-0000-4000-8000-000000000007	30000000-0000-4000-8000-000000000002	Nachos con guacamole	Totopos de maíz con guacamole.	14000.00	t	2
40000000-0000-4000-8000-000000000008	30000000-0000-4000-8000-000000000002	Agua de jamaica	Bebida fría de flor de jamaica.	6500.00	t	0
40000000-0000-4000-8000-000000000009	30000000-0000-4000-8000-000000000003	Pizza margarita personal	Tomate, mozzarella y albahaca.	24000.00	t	12
40000000-0000-4000-8000-000000000010	30000000-0000-4000-8000-000000000003	Pizza de pepperoni personal	Mozzarella y pepperoni sobre masa artesanal.	28000.00	t	6
40000000-0000-4000-8000-000000000011	30000000-0000-4000-8000-000000000003	Pan de ajo	Porción de pan al horno con mantequilla de ajo.	9000.00	t	15
40000000-0000-4000-8000-000000000012	30000000-0000-4000-8000-000000000003	Limonada natural	Limonada recién preparada.	8000.00	t	25
\.


--
-- Data for Name: reservas_inventario; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.reservas_inventario (pedido_id, estado, creada_en, actualizada_en) FROM stdin;
\.


--
-- Data for Name: transacciones_pedido; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.transacciones_pedido (id, pedido_id, monto, moneda, estado, referencia_pasarela, motivo, creada_en, actualizada_en) FROM stdin;
\.


--
-- Name: migraciones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.migraciones_id_seq', 2, true);


--
-- Name: migraciones PK_c790b3af92e49234538c56f4abb; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migraciones
    ADD CONSTRAINT "PK_c790b3af92e49234538c56f4abb" PRIMARY KEY (id);


--
-- Name: detalles_pedido detalles_pedido_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalles_pedido
    ADD CONSTRAINT detalles_pedido_pkey PRIMARY KEY (id);


--
-- Name: establecimientos establecimientos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establecimientos
    ADD CONSTRAINT establecimientos_pkey PRIMARY KEY (id);


--
-- Name: eventos_referencia eventos_referencia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos_referencia
    ADD CONSTRAINT eventos_referencia_pkey PRIMARY KEY (evento_id);


--
-- Name: pedidos pedidos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_pkey PRIMARY KEY (id);


--
-- Name: productos productos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_pkey PRIMARY KEY (id);


--
-- Name: reservas_inventario reservas_inventario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas_inventario
    ADD CONSTRAINT reservas_inventario_pkey PRIMARY KEY (pedido_id);


--
-- Name: transacciones_pedido transacciones_pedido_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transacciones_pedido
    ADD CONSTRAINT transacciones_pedido_pkey PRIMARY KEY (id);


--
-- Name: pedidos uq_pedidos_codigo_qr; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT uq_pedidos_codigo_qr UNIQUE (codigo_qr);


--
-- Name: idx_detalles_producto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_detalles_producto ON public.detalles_pedido USING btree (producto_id);


--
-- Name: idx_establecimientos_evento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_establecimientos_evento ON public.establecimientos USING btree (evento_id);


--
-- Name: idx_pedidos_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedidos_cliente ON public.pedidos USING btree (cliente_id);


--
-- Name: idx_pedidos_establecimiento_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedidos_establecimiento_estado ON public.pedidos USING btree (establecimiento_id, estado);


--
-- Name: idx_productos_establecimiento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_productos_establecimiento ON public.productos USING btree (establecimiento_id);


--
-- Name: idx_transacciones_pedido_pedido; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transacciones_pedido_pedido ON public.transacciones_pedido USING btree (pedido_id);


--
-- Name: uq_detalles_pedido_producto; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_detalles_pedido_producto ON public.detalles_pedido USING btree (pedido_id, producto_id);


--
-- Name: detalles_pedido fk_detalles_pedido; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalles_pedido
    ADD CONSTRAINT fk_detalles_pedido FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE RESTRICT;


--
-- Name: detalles_pedido fk_detalles_producto; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalles_pedido
    ADD CONSTRAINT fk_detalles_producto FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE RESTRICT;


--
-- Name: establecimientos fk_establecimientos_evento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establecimientos
    ADD CONSTRAINT fk_establecimientos_evento FOREIGN KEY (evento_id) REFERENCES public.eventos_referencia(evento_id) ON DELETE RESTRICT;


--
-- Name: pedidos fk_pedidos_establecimiento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT fk_pedidos_establecimiento FOREIGN KEY (establecimiento_id) REFERENCES public.establecimientos(id) ON DELETE RESTRICT;


--
-- Name: productos fk_productos_establecimiento; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT fk_productos_establecimiento FOREIGN KEY (establecimiento_id) REFERENCES public.establecimientos(id) ON DELETE RESTRICT;


--
-- Name: reservas_inventario fk_reservas_inventario_pedido; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas_inventario
    ADD CONSTRAINT fk_reservas_inventario_pedido FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE RESTRICT;


--
-- Name: transacciones_pedido fk_transacciones_pedido; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transacciones_pedido
    ADD CONSTRAINT fk_transacciones_pedido FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict fO2bZwKxNCo6HX5B7RxGCvLNofdF1aW0fBiGmMWrmriBUIEDNz9bWp8gxC0wTUh

