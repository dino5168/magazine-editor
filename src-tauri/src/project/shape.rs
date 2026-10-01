//! Vertices of polygon and star shapes. Same formulas as `src/lib/editor/shape-geometry.ts`.
//!
//! A shape's vertices always fill its box: the regular polygon (first vertex pointing up, as in
//! Konva) is computed at radius 1 and then stretched so its extremes touch the box edges.

use std::f64::consts::PI;

/// Vertices around the origin; `radii` alternate (one radius for polygons, outer / inner for stars).
fn regular_points(radii: &[f64], count: usize) -> Vec<[f64; 2]> {
    (0..count)
        .map(|n| {
            let radius = radii[n % radii.len()];
            let angle = n as f64 * 2.0 * PI / count as f64;
            [radius * angle.sin(), -radius * angle.cos()]
        })
        .collect()
}

/// Unit (radius 1) vertices of a regular polygon. Fewer than 3 sides count as 3.
pub fn polygon_unit_points(sides: u32) -> Vec<[f64; 2]> {
    regular_points(&[1.0], sides.max(3) as usize)
}

/// Unit (outer radius 1) vertices of a star. Fewer than 2 points count as 2.
pub fn star_unit_points(num_points: u32, inner_ratio: f64) -> Vec<[f64; 2]> {
    regular_points(&[1.0, inner_ratio], num_points.max(2) as usize * 2)
}

/// `[min_x, min_y, max_x, max_y]` of a point list.
pub fn point_bounds(points: &[[f64; 2]]) -> [f64; 4] {
    points.iter().fold(
        [f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY],
        |[min_x, min_y, max_x, max_y], [x, y]| [min_x.min(*x), min_y.min(*y), max_x.max(*x), max_y.max(*y)],
    )
}

/// Stretches unit vertices so they fill a `width` × `height` box whose top-left corner is the origin.
pub fn fit_to_box(points: &[[f64; 2]], width: f64, height: f64) -> Vec<[f64; 2]> {
    let [min_x, min_y, max_x, max_y] = point_bounds(points);
    let (span_x, span_y) = (max_x - min_x, max_y - min_y);
    points
        .iter()
        .map(|[x, y]| [(x - min_x) / span_x * width, (y - min_y) / span_y * height])
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn regular_points_match_konva() {
        let triangle = polygon_unit_points(3);
        assert!(triangle[0][0].abs() < 1e-9 && (triangle[0][1] + 1.0).abs() < 1e-9, "first vertex points up");
        let star = star_unit_points(5, 0.4);
        assert_eq!(star.len(), 10);
        assert!((star[1][0].hypot(star[1][1]) - 0.4).abs() < 1e-9, "odd vertices use the inner radius");
    }

    #[test]
    fn fitted_points_touch_every_box_edge() {
        let points = fit_to_box(&star_unit_points(5, 0.4), 200.0, 100.0);
        let [min_x, min_y, max_x, max_y] = point_bounds(&points);
        for (actual, expected) in [(min_x, 0.0), (min_y, 0.0), (max_x, 200.0), (max_y, 100.0)] {
            assert!((actual - expected).abs() < 1e-9, "{actual} != {expected}");
        }
    }
}
