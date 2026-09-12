import { BookOpen } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { Btn, Notice, fmt, money } from '../Primitives';
import { useCopilot } from '../../state/copilot';

export const RecordDialog = () => {
  const { pending, confirmPending, declinePending } = useCopilot();
  const preview = pending?.preview as Record<string, number | null> | undefined;
  return (
    <Dialog open={!!pending} onOpenChange={open => { if (!open) declinePending(); }}>
      <DialogContent className="app-dialog" data-testid="copilot-record-dialog">
        <DialogTitle data-testid="copilot-record-title">Record this estimate?</DialogTitle>
        <DialogDescription data-testid="copilot-record-description">
          {pending?.factoryName} · {pending?.interventionNames.join(' + ')} · {pending?.adoption}% adoption
        </DialogDescription>
        {preview && (
          <div className="copilot-record-figures">
            <div><span>Estimated reduction</span><strong>{fmt(Number(preview.reduction_tco2e_yr))} tCO₂e/yr</strong></div>
            <div><span>Net operating savings</span><strong>{money(Number(preview.net_operating_savings_inr_yr))}/yr</strong></div>
            <div><span>Upfront capex</span><strong>{money(Number(preview.capex_inr_one_off))}</strong></div>
            <div><span>Simple payback</span><strong>{preview.payback_months === null ? 'No break-even' : preview.payback_months === 0 ? 'Immediate' : `${Number(preview.payback_months).toFixed(1)} months`}</strong></div>
          </div>
        )}
        <Notice id="copilot-record-warning">
          The Copilot proposed this scenario; the figures come from the session calculator. Recording adds a
          demonstration label only. No independent verification, registry issuance, measured savings, or financial
          revenue will occur.
        </Notice>
        <div className="dialog-actions">
          <Btn data-testid="copilot-cancel-record" onClick={declinePending}>Cancel</Btn>
          <Btn variant="primary" data-testid="copilot-confirm-record" onClick={confirmPending}><BookOpen size={16} />Record estimate</Btn>
        </div>
      </DialogContent>
    </Dialog>
  );
};
