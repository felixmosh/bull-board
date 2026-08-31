import { Layout as BasicLayout } from '@rspress/core/theme-original';
import GitHubStars from '../docs/.rspress/components/GitHubStars';
import HomeExtras from '../docs/.rspress/components/HomeExtras';

const Layout = () => <BasicLayout afterNavTitle={<GitHubStars />} afterFeatures={<HomeExtras />} />;

export { Layout };
export * from '@rspress/core/theme-original';
