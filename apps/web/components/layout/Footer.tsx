export function Footer() {
  return (
    <footer className="border-t border-border mt-auto py-8 text-center text-sm text-muted-foreground">
      <div className="container mx-auto px-4">
        <p>
          נתונים מבוססים על{" "}
          <a
            href="https://oknesset.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Open Knesset
          </a>
          {" "}— מידע ציבורי בשירות הציבור
        </p>
        <p className="mt-1 text-xs text-muted-foreground/60">
          הנתונים מתעדכנים כל 6 שעות
        </p>
      </div>
    </footer>
  );
}
