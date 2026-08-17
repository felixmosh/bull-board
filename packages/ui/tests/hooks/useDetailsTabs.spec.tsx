import { DEFAULT_JOB_TAB, resolveSelectedTab, type TabsType } from '../../src/hooks/useDetailsTabs';
import { migrateSettings } from '../../src/hooks/useSettings';

/** The order `useDetailsTabs` builds for anything that has not failed. */
const tabsForHealthyJob: TabsType[] = ['Data', 'Progress', 'Options', 'Logs', 'Error'];

/** A failed job leads with Error, which is what makes `tabs[0]` status-aware. */
const tabsForFailedJob: TabsType[] = ['Error', 'Data', 'Progress', 'Options', 'Logs'];

describe('resolveSelectedTab', () => {
  describe('with no preference and nothing configured', () => {
    it('opens a healthy job on Data', () => {
      expect(resolveSelectedTab(tabsForHealthyJob, DEFAULT_JOB_TAB, undefined)).toBe('Data');
    });

    it('opens a failed job on Error', () => {
      expect(resolveSelectedTab(tabsForFailedJob, DEFAULT_JOB_TAB, undefined)).toBe('Error');
    });
  });

  describe('with a board-wide default configured', () => {
    it('uses it when the viewer has expressed no preference', () => {
      expect(resolveSelectedTab(tabsForHealthyJob, DEFAULT_JOB_TAB, 'Logs')).toBe('Logs');
    });

    it('applies to failed jobs too, ahead of the status-aware order', () => {
      expect(resolveSelectedTab(tabsForFailedJob, DEFAULT_JOB_TAB, 'Logs')).toBe('Logs');
    });

    it("loses to the viewer's own choice", () => {
      expect(resolveSelectedTab(tabsForHealthyJob, 'Options', 'Logs')).toBe('Options');
    });

    it('falls through when the tab does not apply to this job', () => {
      // Timeline only exists on mobile, so a board configured for it still has to render
      // something everywhere else rather than blanking the panel.
      expect(resolveSelectedTab(tabsForHealthyJob, DEFAULT_JOB_TAB, 'Timeline')).toBe('Data');
      expect(resolveSelectedTab(tabsForFailedJob, DEFAULT_JOB_TAB, 'Timeline')).toBe('Error');
    });
  });

  describe('with a preference the job has no tab for', () => {
    it('falls back to the configured default before the tab order', () => {
      expect(resolveSelectedTab(tabsForHealthyJob, 'Timeline', 'Logs')).toBe('Logs');
    });

    it('falls back to the tab order when nothing is configured', () => {
      expect(resolveSelectedTab(tabsForFailedJob, 'Timeline', undefined)).toBe('Error');
    });
  });
});

describe('migrateSettings', () => {
  it('turns the legacy Data default into "no preference"', () => {
    // Everyone who loaded the board before this change carries `'Data'` whether they chose it
    // or not, and without this it would outrank the operator's own default forever.
    expect(migrateSettings({ defaultJobTab: 'Data' }, 0).defaultJobTab).toBe(DEFAULT_JOB_TAB);
  });

  it('leaves a tab the viewer actually picked alone', () => {
    expect(migrateSettings({ defaultJobTab: 'Logs' }, 0).defaultJobTab).toBe('Logs');
  });

  it('leaves the rest of the persisted settings untouched', () => {
    expect(migrateSettings({ defaultJobTab: 'Data', jobsPerPage: 50 }, 0)).toEqual({
      defaultJobTab: DEFAULT_JOB_TAB,
      jobsPerPage: 50,
    });
  });

  it('does not rewrite Data once the viewer is already on the current version', () => {
    expect(migrateSettings({ defaultJobTab: 'Data' }, 1).defaultJobTab).toBe('Data');
  });
});
