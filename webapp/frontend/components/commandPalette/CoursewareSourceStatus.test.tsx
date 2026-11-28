import {render,screen} from '@testing-library/react';
import {expect,it} from 'vitest';
import {CoursewareSourceStatus} from './CoursewareSourceStatus';
const empty={last_full_scan_at:null,latest_status:null,latest_started_at:null,latest_finished_at:null,errors:0};
it('distinguishes indexed files from an absent full-scan record',()=>{
 render(<CoursewareSourceStatus freshness={empty} indexedFiles={29200}/>);
 expect(screen.getByText('Files indexed; full scan not yet recorded')).toBeVisible();
 expect(screen.queryByText('No completed full scan recorded')).toBeNull();
});
it('keeps the last successful scan visible when a later scan failed',()=>{
 render(<CoursewareSourceStatus freshness={{...empty,last_full_scan_at:'2026-11-26T18:13:51Z',latest_status:'error',latest_finished_at:'2026-11-27T18:18:12Z'}} indexedFiles={95000}/>);
 expect(screen.getByText(/Last full scan/)).toBeVisible();
 expect(screen.getByText(/Latest scan failed; indexed files remain available/)).toBeVisible();
 expect(document.querySelector('time')).toHaveAttribute('dateTime','2026-11-26T18:13:51Z');
});
it('does not imply an empty source has been indexed',()=>{
 render(<CoursewareSourceStatus freshness={empty} indexedFiles={0}/>);
 expect(screen.getByText('No completed full scan recorded')).toBeVisible();
});
