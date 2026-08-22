import NextLink from "next/dist/client/link";
import { forwardRef } from "react";

const Link = forwardRef(function Link(props: any, ref) {
  return <NextLink ref={ref} {...props} legacyBehavior />;
});

export default Link;
