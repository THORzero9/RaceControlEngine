// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import App from '../App';

afterEach(() => {
  cleanup();
});

// Mock global fetch since App.jsx fetches regulations and archive incidents on mount
global.fetch = vi.fn().mockImplementation((url) => {
  if (url.includes('/api/v1/regulations')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([
        {
          _id: "MOTOGP_ARTICLE_1_21",
          series_id: "MOTOGP",
          title: "Behaviour During Practice and Race",
          raw_text: "### Article 1.21\n\n**Behaviour During Practice and Race**\n\nRiders must ride in a responsible manner."
        }
      ]),
    });
  }
  if (url.includes('/api/v1/investigate')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        incident_details: {
          series_id: "MOTOGP",
          track_layout: "Jerez",
          turn_number: 13,
          track_conditions: "DRY",
          marshal_notes: "Rider ran wide on track limits"
        },
        regulatory_framework: {
          governing_body: "FIM",
          allowable_penalties: ["LONG LAP PENALTY"]
        },
        applicable_clauses: [
          {
            _id: "MOTOGP_ARTICLE_1_21",
            series_id: "MOTOGP",
            title: "Behaviour During Practice and Race",
            raw_text: "Riders must ride in a responsible manner."
          }
        ],
        steward_draft_ruling: "Steward draft: Rider violated track limits. Recommended penalty: LONG LAP PENALTY."
      }),
    });
  }
  if (url.includes('/health')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ status: 'healthy' }),
    });
  }
  if (url.includes('/api/v1/adjudicate') || url.includes('/api/v1/archive')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([]),
    });
  }
  return Promise.reject(new Error('Unknown API endpoint'));
});

describe('Dashboard HUD Series Selection', () => {
  it('updates state and renders MOTOGP regulations when selected from dropdown', async () => {
    render(<App />);
    
    // Find the select dropdown for championship series by its display value
    const selectDropdown = screen.getByDisplayValue('FORMULA 1 (FIA)');
    expect(selectDropdown).toBeDefined();
    expect(selectDropdown.value).toBe('F1');
    
    // Simulate user selecting "MOTOGP" from the dropdown
    fireEvent.change(selectDropdown, { target: { value: 'MOTOGP' } });
    
    // Assert that the state handler updates the value
    expect(selectDropdown.value).toBe('MOTOGP');
    
    // Assert that the layout renders the retrieved markdown headers correctly
    const markdownTitle = await screen.findByText('Behaviour During Practice and Race', { selector: 'h5' });
    expect(markdownTitle).toBeDefined();
  });

  it('locks controls and displays archived status after clicking approve adjudication', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<App />);
    
    // Select MOTOGP
    const selectDropdown = screen.getByDisplayValue('FORMULA 1 (FIA)');
    fireEvent.change(selectDropdown, { target: { value: 'MOTOGP' } });
    
    // Simulate clicking RUN CO-PILOT ANALYSIS
    const analyzeButton = screen.getByText('RUN CO-PILOT ANALYSIS');
    fireEvent.click(analyzeButton);
    
    // Wait for the co-pilot analysis response to load and display
    const draftText = await screen.findByText(/Steward draft: Rider violated/);
    expect(draftText).toBeDefined();
    
    // Find the APPROVE ADJUDICATION button and click it
    const approveButton = screen.getByText('APPROVE ADJUDICATION');
    expect(approveButton).toBeDefined();
    expect(approveButton.disabled).toBe(false);
    
    fireEvent.click(approveButton);
    
    // Verify the button changes to "ADJUDICATION ARCHIVED & LOCKED" and is disabled
    const lockedButton = await screen.findByText('ADJUDICATION ARCHIVED & LOCKED');
    expect(lockedButton).toBeDefined();
    expect(lockedButton.disabled).toBe(true);

    // Verify alert was called
    expect(alertSpy).toHaveBeenCalledWith('Incident Judgment Logged Safely to Archive Cluster.');

    alertSpy.mockRestore();
  });
});
