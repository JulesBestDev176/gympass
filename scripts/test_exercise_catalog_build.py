import importlib.util
import pathlib
import unittest
import sys

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location('catalog_build', pathlib.Path(__file__).with_name('exercise_catalog_build.py'))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class CatalogTests(unittest.TestCase):
    def fixture(self):
        flow = {'id': '0025', 'name': 'curl', 'target': 'biceps', 'secondaryMuscles': ['forearms'], 'equipment': 'dumbbell', 'animation': None}
        french = {'id': '0025', 'name': 'curl', 'equipment': 'dumbbell', 'instruction_steps': {'fr': ['Lever les bras.']}}
        return flow, french

    def test_join_preserves_ids_french_and_missing_media(self):
        flow, french = self.fixture()
        item = builder.normalize(flow, french)
        self.assertEqual(item['sourceId'], '0025')
        self.assertEqual(item['instructionsFr'], ['Lever les bras.'])
        self.assertEqual(item['musclesPrimaires'], ['Biceps'])
        self.assertEqual(item['equipementRequis'], 'Haltères')
        self.assertFalse(item['hasAnimation'])

    def test_mismatched_binding_is_rejected(self):
        flow, french = self.fixture()
        french['name'] = 'squat'
        with self.assertRaises(ValueError):
            builder.normalize(flow, french)

    def test_missing_french_is_rejected(self):
        flow, french = self.fixture()
        french['instruction_steps']['fr'] = []
        with self.assertRaises(ValueError):
            builder.normalize(flow, french)

    def test_unsafe_id_and_unexpected_animation_paths_are_rejected(self):
        flow, french = self.fixture()
        flow['id'] = french['id'] = '../escape'
        with self.assertRaises(ValueError):
            builder.normalize(flow, french)
        flow, french = self.fixture()
        flow['animation'] = {'frames': ['https://host/a.svg'] * 3, 'sequence': [0, 1, 2, 1], 'frameDurationMs': 180, 'license': 'CC0-1.0'}
        with self.assertRaises(ValueError):
            builder.normalize(flow, french)


if __name__ == '__main__':
    unittest.main()
