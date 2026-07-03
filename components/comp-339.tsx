import {
  AtSignIcon,
  ChevronDownIcon,
  CircleDashedIcon,
  CommandIcon,
  EclipseIcon,
  GaugeIcon,
  type LucideIcon,
  ZapIcon,
} from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const items = [
  {
    collapsibles: [
      {
        content:
          "We optimize every component for maximum performance and minimal bundle size.",
        icon: GaugeIcon,
        title: "What about performance?",
      },
      {
        content:
          "Our documentation is comprehensive and includes live examples for every component.",
        icon: CircleDashedIcon,
        title: "How is the documentation?",
      },
    ],
    icon: CommandIcon,
    id: "1",
    title: "What makes coss ui different?",
  },
  {
    collapsibles: [
      {
        content:
          "Yes, our theming system is fully customizable and supports both light and dark modes.",
        icon: GaugeIcon,
        title: "Can I use custom themes?",
      },
      {
        content:
          "We have first-class support for Tailwind CSS with custom utility classes.",
        icon: CircleDashedIcon,
        title: "What about Tailwind support?",
      },
    ],
    icon: EclipseIcon,
    id: "2",
    title: "How can I customize the components?",
  },
  {
    collapsibles: [
      {
        content:
          "Our components are tree-shakeable and typically add minimal overhead to your bundle.",
        icon: GaugeIcon,
        open: true,
        title: "What's the bundle size impact?",
      },
      {
        content:
          "We support automatic code splitting for optimal loading performance.",
        icon: CircleDashedIcon,
        title: "How is code splitting handled?",
      },
    ],
    icon: ZapIcon,
    id: "3",
    title: "Is coss ui optimized for performance?",
  },
  {
    collapsibles: [
      {
        content:
          "We test with NVDA, VoiceOver, and JAWS to ensure broad compatibility.",
        icon: GaugeIcon,
        title: "Which screen readers are supported?",
      },
      {
        content:
          "Full keyboard navigation support is implemented following WAI-ARIA best practices.",
        icon: CircleDashedIcon,
        title: "What about keyboard navigation?",
      },
    ],
    icon: AtSignIcon,
    id: "4",
    title: "How accessible are the components?",
  },
];

export default function Component() {
  return (
    <div className="space-y-4">
      <h2 className="font-bold text-xl">Multi-level w/ icon</h2>
      <Accordion className="w-full" collapsible defaultValue="3" type="single">
        {items.map((item) => (
          <AccordionItem
            className="outline-none has-focus-visible:border-ring has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50"
            key={item.id}
            value={item.id}
          >
            <AccordionTrigger className="[&>svg]:-order-1 justify-start gap-3 rounded-md text-[15px] leading-6 outline-none hover:no-underline focus-visible:ring-0">
              <span className="flex items-center gap-3">
                <item.icon
                  aria-hidden="true"
                  className="shrink-0 opacity-60"
                  size={16}
                />
                <span>{item.title}</span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="p-0">
              {item.collapsibles.map((collapsible, _index) => (
                <CollapsibleDemo
                  content={collapsible.content}
                  icon={collapsible.icon}
                  key={collapsible.title}
                  open={collapsible.open}
                  title={collapsible.title}
                />
              ))}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

function CollapsibleDemo({
  title,
  content,
  open,
  icon: Icon,
}: {
  title: string;
  content: string;
  open?: boolean;
  icon: LucideIcon;
}) {
  return (
    <Collapsible className="border-t py-3 ps-6 pe-4" defaultOpen={open}>
      <CollapsibleTrigger className="flex gap-2 font-semibold text-[15px] leading-6 [&[data-state=open]>svg]:rotate-180">
        <ChevronDownIcon
          aria-hidden="true"
          className="mt-1 shrink-0 opacity-60 transition-transform duration-200"
          size={16}
        />
        <span className="flex items-center gap-3">
          <Icon aria-hidden="true" className="shrink-0 opacity-60" size={16} />
          <span>{title}</span>
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 overflow-hidden ps-6 text-muted-foreground text-sm transition-all data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        {content}
      </CollapsibleContent>
    </Collapsible>
  );
}
