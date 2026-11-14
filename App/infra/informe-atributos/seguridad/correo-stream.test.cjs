// Usa Nodemailer real en memoria: nunca abre SMTP ni activa Gmail.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {backend,cargar,path}=require('./comun.cjs');
test('Nodemailer actualizado conserva el contrato de EnviadorSmtp sin red',async()=>{
 const {createTransport}=cargar('nodemailer');
 const {EnviadorSmtp}=cargar(path.join(backend,'dist/modulos/comunicaciones/correos/enviador-correo'));
 const t=createTransport({streamTransport:true,buffer:true}),enviar=t.sendMail.bind(t);let resultado;
 t.sendMail=async datos=>{resultado=await enviar(datos);return resultado;};
 await new EnviadorSmtp({host:'smtp.invalid',puerto:465,seguro:true,usuario:'fixture@example.test',contrasena:'sintetica',remitente:'fixture@example.test'},t).enviar({para:'destino@example.test',asunto:'Fixture RNF',texto:'Prueba sin proveedor externo'});
 assert.equal(resultado.envelope.from,'fixture@example.test');assert.deepEqual(resultado.envelope.to,['destino@example.test']);
 assert.match(resultado.message.toString(),/From: HEXACORE <fixture@example\.test>/);assert.match(resultado.message.toString(),/Prueba sin proveedor externo/);
 t.close();
});
