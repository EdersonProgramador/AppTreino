import { useAutoAnimate } from "@formkit/auto-animate/react";
import type { HTMLAttributes, ReactNode } from "react";

type AnimatedListProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

/** Lista com AutoAnimate — animações leves de entrada/saída. */
export function AnimatedList({ children, className, ...props }: AnimatedListProps) {
  const [ref] = useAutoAnimate();
  return (
    <div ref={ref} className={className} {...props}>
      {children}
    </div>
  );
}
