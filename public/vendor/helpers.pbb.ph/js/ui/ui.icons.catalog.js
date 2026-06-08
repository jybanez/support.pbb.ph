export const ICON_DEFINITIONS = {
  "actions.add": icon("actions", [
    line(12, 5, 12, 19),
    line(5, 12, 19, 12),
  ]),
  "actions.check": icon("actions", [
    polyline("5 13 10 18 19 7"),
  ]),
  "actions.close": icon("actions", [
    line(6, 6, 18, 18),
    line(18, 6, 6, 18),
  ]),
  "actions.copy": icon("actions", [
    rect(9, 9, 10, 10, 2),
    path("M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"),
  ]),
  "actions.delete": icon("actions", [
    path("M4 7h16"),
    path("M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"),
    path("M7 7l1 12a1 1 0 0 0 1 .9h6a1 1 0 0 0 1-.9L17 7"),
    line(10, 11, 10, 17),
    line(14, 11, 14, 17),
  ]),
  "actions.download": icon("actions", [
    line(12, 4, 12, 15),
    polyline("8 11 12 15 16 11"),
    path("M5 19h14"),
  ]),
  "actions.edit": icon("actions", [
    path("M4 20l4.5-1 9.3-9.3a2.1 2.1 0 0 0-3-3L5.5 16 4 20z"),
    path("M13.5 6.5l4 4"),
  ]),
  "actions.settings": icon("actions", [
    circle(12, 12, 3),
    path("M12 5.5v1.5"),
    path("M12 17v1.5"),
    path("M5.5 12H7"),
    path("M17 12h1.5"),
    path("M7.4 7.4 8.5 8.5"),
    path("M15.5 15.5l1.1 1.1"),
    path("M7.4 16.6l1.1-1.1"),
    path("M15.5 8.5l1.1-1.1"),
    circle(12, 12, 7),
  ]),
  "actions.options": icon("actions", [
    line(4, 7, 20, 7),
    circle(9, 7, 1.6),
    line(4, 12, 20, 12),
    circle(15, 12, 1.6),
    line(4, 17, 20, 17),
    circle(11, 17, 1.6),
  ]),
  "actions.view": icon("actions", [
    path("M2 12Q5.5 6 12 6Q18.5 6 22 12Q18.5 18 12 18Q5.5 18 2 12Z"),
    circle(12, 12, 2.5),
  ]),
  "actions.hide": icon("actions", [
    path("M2 12Q5.5 6 12 6Q18.5 6 22 12Q18.5 18 12 18Q5.5 18 2 12Z"),
    circle(12, 12, 2.5),
    line(5, 19, 19, 5),
  ]),
  "actions.refresh": icon("actions", [
    path("M21 12a9 9 0 1 1-3-6.7"),
    path("M21 3v6h-6"),
  ]),
  "actions.more-horizontal": icon("actions", [
    circle(6, 12, 1.3),
    circle(12, 12, 1.3),
    circle(18, 12, 1.3),
  ]),
  "actions.save": icon("actions", [
    path("M5 4h11l3 3v13H5z"),
    path("M8 4v5h7V4"),
    rect(8, 14, 8, 5, 1),
  ]),
  "actions.attach": icon("actions", [
    path("M9.5 12.5 15 7a3 3 0 1 1 4.2 4.2l-7.8 7.8a5 5 0 0 1-7.1-7.1L12 4.2"),
  ]),
  "actions.export": icon("actions", [
    path("M14 4h6v6"),
    line(20, 4, 12, 12),
    path("M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"),
  ]),
  "actions.sort": icon("actions", [
    line(8, 6, 8, 18),
    polyline("5 9 8 6 11 9"),
    line(16, 18, 16, 6),
    polyline("13 15 16 18 19 15"),
  ]),
  "actions.search": icon("actions", [
    circle(11, 11, 6),
    line(16, 16, 20, 20),
  ]),
  "navigation.chevron-left": icon("navigation", [
    polyline("15 6 9 12 15 18"),
  ]),
  "navigation.chevron-right": icon("navigation", [
    polyline("9 6 15 12 9 18"),
  ]),
  "navigation.chevron-up": icon("navigation", [
    polyline("6 15 12 9 18 15"),
  ]),
  "navigation.chevron-down": icon("navigation", [
    polyline("6 9 12 15 18 9"),
  ]),
  "navigation.arrow-left": icon("navigation", [
    line(19, 12, 5, 12),
    polyline("11 6 5 12 11 18"),
  ]),
  "navigation.arrow-right": icon("navigation", [
    line(5, 12, 19, 12),
    polyline("13 6 19 12 13 18"),
  ]),
  "navigation.arrow-up": icon("navigation", [
    line(12, 19, 12, 5),
    polyline("6 11 12 5 18 11"),
  ]),
  "navigation.arrow-down": icon("navigation", [
    line(12, 5, 12, 19),
    polyline("6 13 12 19 18 13"),
  ]),
  "navigation.home": icon("navigation", [
    path("M3 10.5 12 4l9 6.5"),
    path("M5 9.5V20h14V9.5"),
    path("M9 20v-5h6v5"),
  ]),
  "navigation.menu": icon("navigation", [
    line(4, 7, 20, 7),
    line(4, 12, 20, 12),
    line(4, 17, 20, 17),
  ]),
  "status.success": icon("status", [
    circle(12, 12, 9),
    polyline("8 12 11 15 16 9"),
  ]),
  "status.warning": icon("status", [
    path("M12 4l9 16H3l9-16z"),
    line(12, 9, 12, 13),
    line(12, 17, 12, 17.5),
  ]),
  "status.error": icon("status", [
    circle(12, 12, 9),
    line(9, 9, 15, 15),
    line(15, 9, 9, 15),
  ]),
  "status.info": icon("status", [
    circle(12, 12, 9),
    line(12, 10, 12, 16),
    line(12, 7.5, 12, 7.5),
  ]),
  "media.play": icon("media", [
    path("M8 6l10 6-10 6V6z"),
  ]),
  "media.pause": icon("media", [
    rect(7, 6, 3, 12, 1),
    rect(14, 6, 3, 12, 1),
  ]),
  "media.image": icon("media", [
    rect(4, 5, 16, 14, 2),
    circle(9, 10, 1.2),
    path("M5 16l4-4 3 3 3-3 4 4"),
  ]),
  "media.video": icon("media", [
    rect(4, 6, 12, 12, 2),
    path("M16 10l4-2v8l-4-2z"),
  ]),
  "media.microphone": icon("media", [
    path("M9.5 7a2.5 2.5 0 0 1 5 0v5a2.5 2.5 0 0 1-5 0V7z"),
    path("M7 11.5a5 5 0 0 0 10 0"),
    line(12, 16.5, 12, 20),
    path("M9 20h6"),
  ]),
  "media.audio": icon("media", [
    path("M10 8l5-3v14l-5-3H7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3z"),
    path("M18 9a4 4 0 0 1 0 6"),
  ]),
  "data.grid": icon("data", [
    rect(4, 4, 7, 7, 1.5),
    rect(13, 4, 7, 7, 1.5),
    rect(4, 13, 7, 7, 1.5),
    rect(13, 13, 7, 7, 1.5),
  ]),
  "data.list": icon("data", [
    circle(4.5, 6, 0.8),
    circle(4.5, 12, 0.8),
    circle(4.5, 18, 0.8),
    line(8, 6, 20, 6),
    line(8, 12, 20, 12),
    line(8, 18, 20, 18),
  ]),
  "data.tree": icon("data", [
    circle(7, 7, 2),
    circle(17, 7, 2),
    circle(12, 17, 2),
    path("M9 7h6"),
    path("M12 9v6"),
  ]),
  "data.upload": icon("data", [
    path("M5 18h14"),
    line(12, 16, 12, 6),
    polyline("8 10 12 6 16 10"),
  ]),
  "data.filter": icon("data", [
    path("M4 6h16l-6 7v5l-4-2v-3L4 6z"),
  ]),
  "people.user": icon("people", [
    circle(12, 8, 3.5),
    path("M5 19a7 7 0 0 1 14 0"),
  ]),
  "people.users": icon("people", [
    circle(9, 8.5, 3),
    circle(16.5, 9.5, 2.5),
    path("M4 19a6 6 0 0 1 10 0"),
    path("M15 18a4.5 4.5 0 0 1 5 0"),
  ]),
  "people.profile": icon("people", [
    circle(12, 8, 3.2),
    path("M6.5 18a6.5 6.5 0 0 1 11 0"),
    circle(12, 12, 9),
  ]),
  "people.account": icon("people", [
    rect(4, 5, 16, 14, 2),
    circle(9, 11, 2.3),
    path("M6.5 16a3.8 3.8 0 0 1 5 0"),
    line(14, 10, 17.5, 10),
    line(14, 13, 17.5, 13),
  ]),
  "workflow.assigned": icon("workflow", [
    circle(12, 12, 5),
    circle(12, 12, 1.5),
  ]),
  "workflow.requested": icon("workflow", [
    circle(12, 12, 8),
    line(12, 8, 12, 12),
    line(12, 12, 15, 14),
  ]),
  "workflow.accepted": icon("workflow", [
    polyline("5 13 10 18 19 7"),
  ]),
  "workflow.en-route": icon("workflow", [
    path("M3 12h8l3-4 7 4h-4l-2 5-3-2-2 2"),
  ]),
  "workflow.on-scene": icon("workflow", [
    path("M12 21s-6-5.4-6-10a6 6 0 1 1 12 0c0 4.6-6 10-6 10Z"),
    circle(12, 11, 2.5),
  ]),
  "workflow.completed": icon("workflow", [
    circle(12, 12, 9),
    polyline("8 12 11 15 16 9"),
  ]),
  "workflow.cancelled": icon("workflow", [
    circle(12, 12, 9),
    line(8.5, 8.5, 15.5, 15.5),
    line(15.5, 8.5, 8.5, 15.5),
  ]),
  "places.pin": icon("places", [
    path("M12 21s-6-5.4-6-10a6 6 0 1 1 12 0c0 4.6-6 10-6 10Z"),
    circle(12, 11, 2.5),
  ]),
  "places.route": icon("places", [
    circle(6, 18, 1.6),
    circle(18, 6, 1.6),
    path("M7.5 18c3 0 3-5 6-5s3 5 6 5"),
    polyline("15 6 18 6 18 9"),
  ]),
  "places.map": icon("places", [
    path("M3 6.5 8 4l8 2 5-2v13.5L16 20l-8-2-5 2z"),
    line(8, 4, 8, 18),
    line(16, 6, 16, 20),
  ]),
  "places.home-base": icon("places", [
    path("M4 11l8-6 8 6"),
    path("M6 10v9h12v-9"),
    path("M10 19v-5h4v5"),
    path("M4 21h16"),
  ]),
  "time.clock": icon("time", [
    circle(12, 12, 9),
    line(12, 7, 12, 12),
    line(12, 12, 15.5, 14),
  ]),
  "time.history": icon("time", [
    path("M4 12a8 8 0 1 0 2.3-5.7"),
    polyline("4 5v5h5"),
    line(12, 8, 12, 12),
    line(12, 12, 15, 13.5),
  ]),
  "time.calendar": icon("time", [
    rect(4, 5, 16, 15, 2),
    line(8, 3.5, 8, 7),
    line(16, 3.5, 16, 7),
    line(4, 10, 20, 10),
  ]),
  "time.timer": icon("time", [
    circle(12, 13, 7),
    line(12, 13, 15, 10),
    path("M10 3h4"),
    path("M15.5 5.5 17 4"),
  ]),
  "comms.phone": icon("comms", [
    path("M8.5 5.5c.6-1 1.9-1.4 3-.8l1.7 1c1 .6 1.3 1.9.8 2.9l-.7 1.2c1.1 1.8 2.6 3.3 4.4 4.4l1.2-.7c1-.6 2.3-.2 2.9.8l1 1.7c.6 1 .2 2.4-.8 3-1 .6-2.3 1-3.7.8-2.8-.5-5.6-2-8-4.4S6.1 11.2 5.7 8.4c-.2-1.4.1-2.7.8-3.7Z"),
  ]),
  "comms.radio": icon("comms", [
    rect(8, 8, 8, 12, 1.5),
    line(12, 4, 12, 8),
    line(10, 12, 14, 12),
    path("M5.5 9.5a9 9 0 0 1 13 0"),
    path("M7.5 11.5a6 6 0 0 1 9 0"),
  ]),
  "comms.message": icon("comms", [
    path("M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-5 3v-3H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"),
  ]),
  "comms.notification": icon("comms", [
    path("M12 5a4 4 0 0 0-4 4v2.5c0 1-.4 2-1.1 2.7L5.5 16h13l-1.4-1.8a4 4 0 0 1-1.1-2.7V9a4 4 0 0 0-4-4Z"),
    path("M10 18a2 2 0 0 0 4 0"),
  ]),
  "comms.signal": icon("comms", [
    line(5, 19, 5, 16),
    line(9, 19, 9, 13),
    line(13, 19, 13, 10),
    line(17, 19, 17, 7),
    line(21, 19, 21, 4),
  ]),
  "assets.vehicle": icon("assets", [
    path("M5 16l1.5-5h11L19 16"),
    path("M7 11l2-4h6l2 4"),
    line(5, 16, 19, 16),
    circle(8, 18, 1.6),
    circle(16, 18, 1.6),
  ]),
  "assets.document": icon("assets", [
    path("M7 3h7l5 5v13H7z"),
    path("M14 3v5h5"),
    line(10, 12, 16, 12),
    line(10, 16, 16, 16),
  ]),
  "assets.camera": icon("assets", [
    path("M5 8h3l2-2h4l2 2h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z"),
    circle(12, 14, 3),
  ]),
  "assets.clipboard": icon("assets", [
    rect(6, 5, 12, 15, 2),
    rect(9, 3, 6, 4, 1.5),
    line(9, 11, 15, 11),
    line(9, 15, 13, 15),
  ]),
};

Object.assign(ICON_DEFINITIONS, {
  "sitrep.report": alias("sitrep", "assets.document"),
  "sitrep.summary": alias("sitrep", "assets.clipboard"),
  "sitrep.situation": alias("sitrep", "status.info"),
  "sitrep.gaps": alias("sitrep", "status.warning"),
  "sitrep.needs": alias("sitrep", "workflow.requested"),
  "sitrep.actions": alias("sitrep", "actions.check"),
  "sitrep.population": alias("sitrep", "people.users"),
  "sitrep.damage": alias("sitrep", "places.home-base"),
  "sitrep.source": alias("sitrep", "places.home-base"),
  "sitrep.consolidated": alias("sitrep", "data.tree"),

  "alert.normal": alias("alert", "status.success"),
  "alert.elevated": alias("alert", "status.warning"),
  "alert.critical": alias("alert", "status.error"),
  "alert.watch": alias("alert", "time.clock"),
  "alert.escalate": alias("alert", "navigation.arrow-up"),

  "hazard.flood": icon("hazard", [
    path("M4 15c1.8-1.4 3.2-1.4 5 0s3.2 1.4 5 0 3.2-1.4 5 0"),
    path("M4 19c1.8-1.4 3.2-1.4 5 0s3.2 1.4 5 0 3.2-1.4 5 0"),
    path("M7 11l5-7 5 7"),
  ]),
  "hazard.fire": icon("hazard", [
    path("M12 22c4 0 7-2.8 7-6.7 0-3.1-2.3-5-4.2-7.1-.8 2.1-2.1 3.2-3.8 3.8.9-2.9-.3-5.4-2.5-7C8.2 8.5 5 10.9 5 15.3 5 19.2 8 22 12 22Z"),
    path("M12 18c1.5 0 2.6-1 2.6-2.5 0-1.1-.7-2-1.7-2.8-.4 1-1 1.6-1.9 1.9.3-1.2-.1-2.2-.9-3-1 1.3-1.7 2.4-1.7 3.9 0 1.5 1.1 2.5 2.6 2.5Z"),
  ]),
  "hazard.medical": icon("hazard", [
    rect(5, 6, 14, 13, 2),
    path("M9 6V4h6v2"),
    line(12, 9, 12, 16),
    line(8.5, 12.5, 15.5, 12.5),
  ]),
  "hazard.rescue": icon("hazard", [
    circle(12, 12, 8),
    path("M12 7v10"),
    path("M7 12h10"),
    path("M8.5 8.5l7 7"),
    path("M15.5 8.5l-7 7"),
  ]),
  "hazard.landslide": icon("hazard", [
    path("M3 20h18"),
    path("M5 17l5-9 4 6 2-3 3 6"),
    circle(8, 15, 1),
    circle(13, 18, 1),
    circle(17, 15, 1),
  ]),
  "hazard.infrastructure": icon("hazard", [
    path("M5 20V9l7-4 7 4v11"),
    path("M9 20v-6h6v6"),
    path("M4 12h16"),
    path("M8 9h.1M12 8h.1M16 9h.1"),
  ]),
  "hazard.vehicle": alias("hazard", "assets.vehicle"),
  "hazard.public-safety": alias("hazard", "status.warning"),
  "hazard.missing-person": alias("hazard", "people.user"),
  "hazard.evacuation": alias("hazard", "places.route"),

  "population.people-at-risk": alias("population", "people.users"),
  "population.people-helped": alias("population", "actions.check"),
  "population.family": icon("population", [
    circle(9, 8, 2.5),
    circle(15.5, 8.5, 2),
    circle(12, 13, 1.8),
    path("M4.5 19a5 5 0 0 1 9 0"),
    path("M13.5 18.5a4 4 0 0 1 6 0"),
  ]),
  "population.children": icon("population", [
    circle(12, 8, 3),
    path("M7 19a5 5 0 0 1 10 0"),
    line(9, 13, 6, 16),
    line(15, 13, 18, 16),
  ]),
  "population.senior": icon("population", [
    circle(10, 7.5, 2.8),
    path("M5 19a5.5 5.5 0 0 1 10 0"),
    path("M16 12v8"),
    path("M16 14h3"),
  ]),
  "population.pwd": icon("population", [
    circle(11, 5, 1.5),
    path("M11 8v5h4l2 5"),
    circle(10, 17, 3),
    path("M8 10h5"),
  ]),
  "population.pregnant": icon("population", [
    circle(11, 6, 2.2),
    path("M9 9c-1 2-1.2 6 .2 10"),
    path("M13 9c2 2.3 2.5 7.5-.2 10"),
    circle(13.5, 14, 2.2),
  ]),
  "population.patient": alias("population", "status.info"),
  "population.displaced": alias("population", "places.route"),
  "population.shelter": alias("population", "places.home-base"),

  "route.clear": alias("route", "status.success"),
  "route.limited": alias("route", "status.info"),
  "route.blocked": alias("route", "status.error"),
  "route.caution": alias("route", "status.warning"),
  "route.obstruction": alias("route", "status.warning"),
  "route.bridge": icon("route", [
    path("M4 17h16"),
    path("M6 17c1-5 3-8 6-8s5 3 6 8"),
    line(8, 17, 8, 13),
    line(12, 17, 12, 9),
    line(16, 17, 16, 13),
  ]),
  "route.road": alias("route", "places.route"),

  "resource.requested": alias("resource", "workflow.requested"),
  "resource.deployed": alias("resource", "workflow.assigned"),
  "resource.shortage": alias("resource", "status.warning"),
  "resource.medical-supplies": alias("resource", "status.info"),
  "resource.food-water": icon("resource", [
    path("M7 4v8"),
    path("M5 4v4a2 2 0 0 0 4 0V4"),
    path("M7 12v8"),
    path("M15 4c2 2 2 6 0 8v8"),
    path("M15 4v8"),
  ]),
  "resource.rescue-equipment": alias("resource", "status.success"),
  "resource.heavy-equipment": alias("resource", "assets.vehicle"),
  "resource.sanitation": icon("resource", [
    path("M5 8h14"),
    path("M8 8V5h8v3"),
    path("M7 8l1 12h8l1-12"),
    path("M10 12h4"),
  ]),
  "resource.shelter-supplies": alias("resource", "places.home-base"),
  "resource.transport": alias("resource", "assets.vehicle"),

  "team.rescue": icon("team", [
    circle(12, 12, 8),
    path("M12 7v10"),
    path("M7 12h10"),
    path("M8.5 8.5l7 7"),
    path("M15.5 8.5l-7 7"),
  ]),
  "team.medical": alias("team", "status.info"),
  "team.law-enforcement": icon("team", [
    path("M12 3l7 3v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6l7-3z"),
    path("M9 12l2 2 4-4"),
  ]),
  "team.fire": alias("team", "status.warning"),
  "team.engineering": alias("team", "actions.settings"),
  "team.social-services": alias("team", "people.users"),
  "team.public-safety": alias("team", "status.warning"),
  "team.assessment": alias("team", "data.list"),
  "team.command": alias("team", "comms.radio"),

  "map.boundary": alias("map", "places.map"),
  "map.cluster": icon("map", [
    circle(9, 10, 3),
    circle(15, 10, 3),
    circle(12, 16, 3),
  ]),
  "map.hotspot": icon("map", [
    circle(12, 12, 3),
    circle(12, 12, 7),
    circle(12, 12, 10),
  ]),
  "map.source-hub": alias("map", "places.home-base"),
  "map.target-hub": alias("map", "places.pin"),
  "map.uplink": alias("map", "navigation.arrow-up"),
  "map.coverage-area": alias("map", "places.map"),

  "quality.verified": alias("quality", "status.success"),
  "quality.unverified": alias("quality", "status.warning"),
  "quality.partial": alias("quality", "status.info"),
  "quality.duplicate-risk": alias("quality", "actions.copy"),
  "quality.stale": alias("quality", "time.history"),
  "quality.redacted": alias("quality", "actions.hide"),
});

function icon(category, nodes) {
  return {
    category,
    viewBox: "0 0 24 24",
    nodes,
  };
}

function alias(category, sourceName) {
  const source = ICON_DEFINITIONS[sourceName];
  if (!source) {
    throw new Error(`[ui.icons.catalog] Cannot alias missing icon "${sourceName}".`);
  }
  return icon(category, source.nodes);
}

function path(d) {
  return { tag: "path", attrs: { d } };
}

function line(x1, y1, x2, y2) {
  return { tag: "line", attrs: { x1, y1, x2, y2 } };
}

function polyline(points) {
  return { tag: "polyline", attrs: { points } };
}

function circle(cx, cy, r) {
  return { tag: "circle", attrs: { cx, cy, r } };
}

function rect(x, y, width, height, rx = 0) {
  return { tag: "rect", attrs: { x, y, width, height, rx } };
}
