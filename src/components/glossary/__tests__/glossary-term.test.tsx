// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { GlossaryTerm } from '../glossary-term';

describe('GlossaryTerm', () => {
  it('renders the term label when no children are given', () => {
    render(<GlossaryTerm id="tco2e" />);
    expect(screen.getByText('tCO₂e')).toBeInTheDocument();
  });

  it('renders children as the visible label when provided', () => {
    render(<GlossaryTerm id="tco2e">tons CO₂e</GlossaryTerm>);
    expect(screen.getByText('tons CO₂e')).toBeInTheDocument();
  });

  it('gracefully falls back to children for an unknown id', () => {
    render(<GlossaryTerm id="not-real">Unknown Metric</GlossaryTerm>);
    expect(screen.getByText('Unknown Metric')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('exposes an accessible info trigger', () => {
    render(<GlossaryTerm id="tco2e" />);
    expect(screen.getByRole('button', { name: /about tco₂e/i })).toBeInTheDocument();
  });

  it('shows the definition in a popover when the trigger is clicked', async () => {
    const user = userEvent.setup();
    render(<GlossaryTerm id="tco2e" />);
    await user.click(screen.getByRole('button', { name: /about tco₂e/i }));
    expect(await screen.findByText(/metric tons of carbon-dioxide equivalent/i)).toBeInTheDocument();
  });
});
