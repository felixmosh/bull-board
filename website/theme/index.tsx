import { Layout as BasicLayout } from "@rspress/core/theme-original";
import GitHubStars from "../docs/.rspress/components/GitHubStars";

const Layout = () => <BasicLayout afterNavTitle={<GitHubStars />} />;

export { Layout };
export * from "@rspress/core/theme-original";
