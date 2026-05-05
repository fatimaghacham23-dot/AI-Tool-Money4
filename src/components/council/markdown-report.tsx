export function MarkdownReport({ markdown }: { markdown: string }) {
  const sections = markdown
    .split(/\n(?=#{1,2} )/g)
    .map((section) => section.trim())
    .filter(Boolean);

  return (
    <div className="space-y-4">
      {sections.map((section, index) => {
        const [heading, ...body] = section.split("\n");
        const isTitle = heading.startsWith("# ");
        const title = heading.replace(/^#+\s*/, "");

        return (
          <section
            key={`${title}-${index}`}
            className={
              isTitle
                ? "rounded-lg border border-primary/35 bg-primary/10 p-5"
                : "rounded-lg border border-border bg-card/72 p-5"
            }
          >
            <h2 className={isTitle ? "text-2xl font-semibold" : "text-lg font-semibold"}>
              {title}
            </h2>
            <div className="mt-4 overflow-x-auto whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
              {body.join("\n").trim()}
            </div>
          </section>
        );
      })}
    </div>
  );
}
