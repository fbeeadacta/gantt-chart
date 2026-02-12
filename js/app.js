// app.js - Namespace globale e stato dell'applicazione
const App = {
    state: {
        projects: [],
        currentProjectId: null,
        currentView: 'dashboard', // 'dashboard' | 'gantt'
        baselineActive: false,
        showDependencyArrows: true,
        showCriticalPath: false,
        versionsPanelOpen: false,
        customToday: null, // null = data reale, oppure 'YYYY-MM-DD'
        dirHandle: null,
        fsAccessSupported: 'showDirectoryPicker' in window,
        monthWidth: null, // null = auto-fit, oppure larghezza fissa in px SVG
        leftPanelWidth: null, // null = default da App.GANTT.leftPanelWidth (380px)
        svgHeight: null, // null = default calcolato, oppure altezza custom in px SVG
        theme: {}, // override colori/font, merge con DEFAULTS_THEME
        dashboardSearch: '',
        dashboardSort: 'lastSaved',    // 'nameAsc' | 'nameDesc' | 'lastSaved' | 'startDate'
        dashboardViewMode: 'grid',     // 'grid' | 'list'
        dashboardClientFilter: '',      // '' = tutti, oppure nome cliente
        timelineUnit: 'month',           // 'week' | 'month' | 'quarter'
        globalGanttExpanded: false,      // compatto vs espanso nel portfolio
        globalGanttTimelineUnit: 'month', // zoom indipendente per portfolio
        globalGanttMonthWidth: null      // null = auto-fit
    },

    DEFAULTS_THEME: {
        fontFamily: 'Arial, sans-serif',
        activityBg: '#a8c8e8',
        activityFill: '#1a3a5c',
        phaseFill: '#1a3a5c',
        headerBg: '#5c88da',
        phaseLabelBg: '#9db8e9',
        titleBg: '#5c88da',
        todayLine: '#e74c3c',
        milestone: '#1a3a5c'
    },

    COLORS: {
        primary: '#1a3a5c',
        primaryLight: '#a8c8e8',
        gold: '#ED7D31',
        gray: '#A5A5A5',
        red: '#e74c3c',
        white: '#ffffff',
        headerBg: '#5c88da',
        headerMonthBg: '#d9d9d9',
        phaseBorder: '#ED7D31',
        gridLine: '#D9D9D9',
        yearLine: '#AEAAAA',
        rowAlt: '#f8f9fa'
    },

    COLOR_PRESETS: ['#1a3a5c', '#5c88da', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#c0392b'],

    MONTHS_IT: ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'],

    // Dimensioni SVG Gantt (16:9)
    GANTT: {
        width: 1920,
        height: 1080,
        leftPanelWidth: 380,
        titleColWidth: 40,
        phaseLabelWidth: 40,
        headerHeight: 56,
        steeringRowHeight: 32,
        phaseRowHeight: 26,
        activityRowHeight: 26,
        rowGap: 3,
        phaseSeparator: 8,
        barHeight: 16,
        summaryBarHeight: 10,
        milestoneSize: 10,
        padding: { top: 10, bottom: 20, left: 10, right: 20 }
    },

    getCurrentProject() {
        return this.state.projects.find(p => p.id === this.state.currentProjectId) || null;
    }
};
