// Sección "Textos": las 6 claves de CLAVES_TEXTOS con su valor actual (BD si
// hay override, si no el default) y un campo editable por clave que hace
// upsert en la tabla `textos` vía guardarTexto().

import { obtenerTextos } from "@/lib/textos/obtener-textos";
import { CLAVES_TEXTOS } from "@/lib/textos/defaults";
import CampoTexto from "@/components/admin/CampoTexto";

export default async function SeccionTextos() {
  const textos = await obtenerTextos();

  return (
    <div className="space-y-4">
      {CLAVES_TEXTOS.map((clave) => (
        <CampoTexto key={clave} clave={clave} valorInicial={textos[clave]} />
      ))}
    </div>
  );
}
