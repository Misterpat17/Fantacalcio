import { Button } from "./ui/Button";

// Intestazione condivisa dalle pagine Classifica/Budget/Rose/Storico:
// titolo + bottone di download (stesso file Excel multi-foglio per
// tutte, così chi vuole un'esportazione completa non deve cambiare
// pagina).
export function ReportPageHeader({ code, title }: { code: string; title: string }) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-black">{title}</h1>
      <a href={`/api/leagues/${code}/export`}>
        <Button variant="secondary">Esporta in Excel</Button>
      </a>
    </div>
  );
}
